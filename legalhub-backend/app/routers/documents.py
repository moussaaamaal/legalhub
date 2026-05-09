import asyncio
import uuid
import re
import unicodedata
import logging
from urllib.parse import unquote
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase, supabase_admin
from app.core.config import settings
from app.models.enums import DocumentCategory, DocumentStatus
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# ─── Helpers ────────────────────────────────────────────

def _sanitize_filename(filename: str) -> str:
    """Remove accents, replace spaces and special chars with underscores."""
    # Decompose accented characters then strip the accent marks
    normalized = unicodedata.normalize("NFKD", filename)
    ascii_name  = normalized.encode("ascii", "ignore").decode("ascii")
    # Replace anything that's not alphanumeric, dot, dash, or underscore
    safe = re.sub(r"[^\w.\-]", "_", ascii_name)
    # Collapse consecutive underscores
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe or "file"

def _detect_file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        return "PDF"
    if ext in ("doc", "docx"):
        return "WORD"
    if ext in ("jpg", "jpeg", "png", "gif", "webp"):
        return "IMAGE"
    return "OTHER"

def _get_openai():
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    from openai import OpenAI
    return OpenAI(api_key=settings.OPENAI_API_KEY)

MISTRAL_BASE = "https://api.mistral.ai/v1"

def _mistral_headers() -> dict:
    if not settings.MISTRAL_API_KEY:
        raise HTTPException(status_code=503, detail="Mistral AI service not configured")
    return {"Authorization": f"Bearer {settings.MISTRAL_API_KEY}"}

async def _mistral_post(url: str, max_retries: int = 3, **kwargs) -> httpx.Response:
    """POST to Mistral with exponential-backoff retry on 429."""
    delay = 5
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(max_retries + 1):
            resp = await client.post(url, **kwargs)
            if resp.status_code == 429 and attempt < max_retries:
                wait = delay
                try:
                    wait = int(float(resp.headers.get("retry-after", delay)))
                except (ValueError, TypeError):
                    wait = delay
                logger.warning("Mistral rate-limited; waiting %ds (attempt %d/%d)", wait, attempt + 1, max_retries)
                await asyncio.sleep(wait)
                delay = min(delay * 2, 60)
                continue
            if resp.status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="The AI service is busy. Please wait a moment and try again.",
                )
            resp.raise_for_status()
            return resp
    raise HTTPException(status_code=429, detail="The AI service is busy. Please wait a moment and try again.")

# ─── GET /api/documents ─────────────────────────────────

@router.get("")
async def list_documents(
    case_id: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    current_user=Depends(get_lawyer)
):
    query = (
        supabase.table("document")
        .select("*, case_file(id, title, case_number)")
        .eq("firm_id", current_user["firm_id"])
    )
    if case_id:
        query = query.eq("case_id", case_id)
    if category:
        query = query.eq("category", category)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data

# ─── POST /api/documents/upload ─────────────────────────

@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    case_id: str = Form(...),
    original_name: Optional[str] = Form(None),
    current_user=Depends(get_lawyer)
):
    file_content = await file.read()
    file_name    = unquote(original_name) if original_name else (file.filename or "upload")
    safe_name    = _sanitize_filename(file_name)
    file_type    = _detect_file_type(safe_name)
    content_type = file.content_type or "application/octet-stream"

    # Ensure bucket exists (create if missing)
    try:
        supabase_admin.storage.create_bucket("documents", options={"public": True})
        logger.info("Storage bucket 'documents' created successfully")
    except Exception as e:
        err = str(e).lower()
        logger.info(f"create_bucket result: {e!r}")
        # Ignore if bucket already exists (various error formats from Supabase)
        if not any(k in err for k in ("already exists", "409", "duplicate", "already_exists", "violates unique")):
            logger.error(f"Storage bucket creation failed: {e!r}")
            raise HTTPException(status_code=500, detail=f"Storage setup failed: {e}")

    storage_path = f"{current_user['firm_id']}/{case_id}/{uuid.uuid4()}_{safe_name}"
    supabase_admin.storage.from_("documents").upload(
        storage_path,
        file_content,
        file_options={"content-type": content_type},
    )
    storage_url = supabase_admin.storage.from_("documents").get_public_url(storage_path)

    result = supabase.table("document").insert({
        "firm_id":      current_user["firm_id"],
        "case_id":      case_id,
        "uploaded_by":  current_user["id"],
        "file_name":    file_name,   # nom original affiché à l'utilisateur
        "file_type":    file_type,
        "file_size_mb": round(len(file_content) / (1024 * 1024), 4),
        "storage_url":  storage_url,
        "category":     DocumentCategory.OTHER,
        "status":       DocumentStatus.PENDING_REVIEW,
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id":      case_id,
        "firm_id":      current_user["firm_id"],
        "action":       f"Document uploaded: {file_name}",
        "performed_by": current_user["id"],
    }).execute()

    supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    "DOCUMENT_SHARED",
        "title":   "Document Uploaded",
        "message": f"{file_name} has been uploaded successfully.",
    }).execute()

    return result.data[0]

# ─── POST /api/documents/voice-note ─────────────────────

@router.post("/voice-note", status_code=201)
async def upload_voice_note(
    file: UploadFile = File(...),
    case_id: str = Form(...),
    current_user=Depends(get_lawyer)
):
    """Upload an audio file; AI auto-transcribes it and saves as a case note."""
    audio_content = await file.read()
    file_name     = file.filename

    storage_path = f"{current_user['firm_id']}/{case_id}/voice/{uuid.uuid4()}_{file_name}"
    supabase_admin.storage.from_("documents").upload(storage_path, audio_content)
    storage_url = supabase_admin.storage.from_("documents").get_public_url(storage_path)

    # Save the audio file record
    doc = supabase.table("document").insert({
        "firm_id":     current_user["firm_id"],
        "case_id":     case_id,
        "uploaded_by": current_user["id"],
        "file_name":   file_name,
        "file_type":   "OTHER",
        "file_size_mb": round(len(audio_content) / (1024 * 1024), 4),
        "storage_url": storage_url,
        "category":    DocumentCategory.VOICE_TRANSCRIPT,
        "status":      DocumentStatus.APPROVED,
    }).execute()

    transcript = None
    if settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            # Whisper requires a file-like object with a name attribute
            import io
            audio_file = io.BytesIO(audio_content)
            audio_file.name = file_name
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )
            transcript = response.text
        except Exception:
            transcript = None  # Transcription failed; note saved without text

    # Save as a note linked to the case
    note = supabase.table("note").insert({
        "firm_id":     current_user["firm_id"],
        "case_id":     case_id,
        "lawyer_id":   current_user["id"],
        "content":     transcript or f"[Voice note: {file_name} — transcription pending]",
        "is_voice_note": True,
        "document_id": doc.data[0]["id"],
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id":      case_id,
        "firm_id":      current_user["firm_id"],
        "action":       "Voice note uploaded and transcribed",
        "performed_by": current_user["id"],
    }).execute()

    return {
        "document": doc.data[0],
        "note":     note.data[0],
        "transcript": transcript,
    }

# ─── POST /api/documents/voice-note-ai ──────────────────

_NOTE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "save_note",
            "description": "Save the voice note when title, content, and case are all identified.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Concise note title"},
                    "content": {"type": "string", "description": "Full note body"},
                    "case_identifier": {
                        "type": "string",
                        "description": "Case number or case title that identifies the linked case",
                    },
                },
                "required": ["title", "content", "case_identifier"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_clarification",
            "description": "Ask the user for one piece of missing information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "Short, natural question to speak aloud"},
                    "missing_fields": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Field names that are still missing",
                    },
                    "partial_data": {
                        "type": "object",
                        "description": "Data already extracted so far",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                            "case_identifier": {"type": "string"},
                        },
                    },
                },
                "required": ["question", "missing_fields", "partial_data"],
            },
        },
    },
]


@router.post("/voice-note-ai", status_code=200)
async def voice_note_ai(
    file: UploadFile = File(...),
    partial_data: Optional[str] = Form(None),
    prior_transcriptions: Optional[str] = Form(None),
    current_user=Depends(get_lawyer),
):
    """
    Mistral/Voxtral pipeline: STT → LLM (tool calling) → save note or ask.

    The frontend accumulates raw transcriptions and sends them back each turn
    via prior_transcriptions. The backend combines them so the LLM always sees
    the full conversation. partial_data carries already-confirmed field values
    as a safety fallback in case the LLM misses something.

    Returns:
      { status: "saved",      message, note }
      { status: "needs_info", transcription, question, missing_fields, partial_data }
    """
    import json

    headers = _mistral_headers()

    # ── Parse prior context ──────────────────────────────────────────────────
    # existing: already-extracted fields (title, content, case_identifier)
    existing: dict = {}
    if partial_data:
        try:
            existing = json.loads(partial_data)
            existing.pop("_history", None)   # drop legacy key if present
        except Exception:
            existing = {}

    # prior: raw transcriptions from earlier recordings, sent by the frontend
    prior: list = []
    if prior_transcriptions:
        try:
            prior = json.loads(prior_transcriptions)
            if not isinstance(prior, list):
                prior = []
        except Exception:
            prior = []

    # ── Step 1: STT ──────────────────────────────────────────────────────────
    audio_content = await file.read()
    file_name     = file.filename or "voice.m4a"
    content_type  = file.content_type or "audio/mp4"

    try:
        stt_resp = await _mistral_post(
            f"{MISTRAL_BASE}/audio/transcriptions",
            headers=headers,
            files={"file": (file_name, audio_content, content_type)},
            data={"model": "voxtral-mini-2507"},
        )
        transcription: str = stt_resp.json().get("text", "")
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Voxtral STT failed: %s", exc.response.text)
        raise HTTPException(status_code=500, detail=f"Speech transcription failed: {exc.response.text}")
    except Exception as exc:
        logger.error("Voxtral STT error: %r", exc)
        raise HTTPException(status_code=500, detail=f"Speech transcription failed: {exc}")

    if not transcription.strip():
        return {
            "status": "needs_info",
            "transcription": "",
            "question": "I didn't catch anything. Please try again and speak clearly.",
            "missing_fields": ["title", "content", "case_identifier"],
            "partial_data": existing,
        }

    # ── Step 2: Fetch cases ──────────────────────────────────────────────────
    cases_res = (
        supabase.table("case_file")
        .select("id, case_number, title")
        .eq("firm_id", current_user["firm_id"])
        .limit(100)
        .execute()
    )
    cases      = cases_res.data or []
    cases_list = "\n".join(f"- {c['case_number']}: {c['title']}" for c in cases) or "No cases found."

    # ── Step 3: Build LLM prompt ─────────────────────────────────────────────
    # Combine ALL recordings into one user message so the LLM sees everything.
    all_recordings = prior + [transcription]
    if len(all_recordings) > 1:
        lines = "\n".join(
            f"[Recording {i + 1}]: {t}" for i, t in enumerate(all_recordings)
        )
        user_content = (
            f"The user made {len(all_recordings)} separate voice recordings. "
            f"Use ALL of them together to extract the note data:\n\n{lines}"
        )
    else:
        user_content = transcription

    llm_payload = {
        "model": "mistral-large-latest",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a legal assistant that extracts voice note data.\n"
                    "Extract exactly three fields:\n"
                    "  • title           — short, descriptive note title\n"
                    "  • content         — full note body\n"
                    "  • case_identifier — case number or title from the list below\n\n"
                    f"Available cases:\n{cases_list}\n\n"
                    "Rules:\n"
                    "1. If all three fields are identifiable and the case matches, call save_note.\n"
                    "2. Otherwise call request_clarification with one short question for the ONE missing piece.\n"
                    "3. In request_clarification.partial_data always echo back every field you did extract."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        "tools": _NOTE_TOOLS,
        "tool_choice": "any",
    }

    try:
        llm_resp = await _mistral_post(
            f"{MISTRAL_BASE}/chat/completions",
            headers={**headers, "Content-Type": "application/json"},
            json=llm_payload,
        )
        llm_data = llm_resp.json()
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Mistral LLM failed: %s", exc.response.text)
        raise HTTPException(status_code=500, detail=f"LLM extraction failed: {exc.response.text}")
    except Exception as exc:
        logger.error("Mistral LLM error: %r", exc)
        raise HTTPException(status_code=500, detail=f"LLM extraction failed: {exc}")

    msg = llm_data["choices"][0]["message"]

    # ── Step 4: Parse LLM tool call ──────────────────────────────────────────
    llm_fields   = {}   # field values the LLM extracted
    llm_question = None
    llm_missing  = []

    if msg.get("tool_calls"):
        tc        = msg["tool_calls"][0]
        func_name = tc["function"]["name"]
        try:
            tc_args = json.loads(tc["function"]["arguments"])
        except Exception:
            tc_args = {}

        if func_name == "save_note":
            llm_fields = tc_args
        else:
            # request_clarification: fields are nested under partial_data
            llm_question = tc_args.get("question")
            llm_missing  = tc_args.get("missing_fields", [])
            pd = tc_args.get("partial_data") or {}
            llm_fields = {k: v for k, v in pd.items() if v and str(v).strip()}

    # ── Step 5: Backend merge ────────────────────────────────────────────────
    # existing (confirmed from prior turns) wins over an empty LLM value;
    # a non-empty LLM value overwrites existing (user may have corrected it).
    def pick(key):
        v = (llm_fields.get(key) or "").strip()
        return v if v else existing.get(key, "")

    note_title   = pick("title")
    note_content = pick("content")
    note_case_id = pick("case_identifier")

    # ── Step 6: Save immediately if all three fields are present ─────────────
    # We do this regardless of which tool the LLM called: if the merge gives us
    # everything we need, there is no reason to ask another question.
    if note_title and note_content and note_case_id:
        identifier   = note_case_id.lower().strip()
        matched_case = None

        for c in cases:
            num = c["case_number"].lower()
            ttl = c["title"].lower()
            if identifier in num or identifier in ttl or num in identifier or ttl in identifier:
                matched_case = c
                break
        if not matched_case:
            words = [w for w in identifier.split() if len(w) > 2]
            for c in cases:
                haystack = f"{c['case_number']} {c['title']}".lower()
                if any(w in haystack for w in words):
                    matched_case = c
                    break

        if matched_case:
            # Return data for user confirmation before writing to DB
            return {
                "status": "confirm",
                "transcription": transcription,
                "note_data": {
                    "title":       note_title,
                    "content":     note_content,
                    "case_id":     matched_case["id"],
                    "case_number": matched_case["case_number"],
                    "case_title":  matched_case["title"],
                },
            }

        # All fields present but case not matched → ask only for the case
        return {
            "status": "needs_info",
            "transcription": transcription,
            "question": (
                f"I couldn't find a case matching '{note_case_id}'. "
                "Could you say the case number or name more clearly?"
            ),
            "missing_fields": ["case_identifier"],
            "partial_data": {"title": note_title, "content": note_content},
        }

    # ── Step 7: Still missing fields → ask the user ──────────────────────────
    still_missing = llm_missing or [
        f for f in ["title", "content", "case_identifier"]
        if not {"title": note_title, "content": note_content, "case_identifier": note_case_id}[f]
    ]
    question = llm_question or f"Could you provide the {', '.join(still_missing)}?"
    partial  = {k: v for k, v in {
        "title": note_title, "content": note_content, "case_identifier": note_case_id,
    }.items() if v}
    return {
        "status": "needs_info",
        "transcription": transcription,
        "question": question,
        "missing_fields": still_missing,
        "partial_data": partial,
    }


# ─── POST /api/documents/voice-note-ai/confirm ──────────

@router.post("/voice-note-ai/confirm", status_code=201)
async def voice_note_ai_confirm(
    note_data: str = Form(...),
    current_user=Depends(get_lawyer),
):
    """Save a voice note that the user has confirmed on the client side."""
    import json
    try:
        data = json.loads(note_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid note_data JSON")

    title       = (data.get("title") or "").strip()
    content     = (data.get("content") or "").strip()
    case_id     = (data.get("case_id") or "").strip()
    case_number = data.get("case_number", "")

    if not title or not content or not case_id:
        raise HTTPException(status_code=400, detail="title, content, and case_id are required")

    note_res = supabase.table("note").insert({
        "firm_id":       current_user["firm_id"],
        "case_id":       case_id,
        "lawyer_id":     current_user["id"],
        "content":       f"**{title}**\n{content}",
        "is_voice_note": True,
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id":      case_id,
        "firm_id":      current_user["firm_id"],
        "action":       f"Voice note added: {title}",
        "performed_by": current_user["id"],
    }).execute()

    return {
        "status": "saved",
        "message": f"Note '{title}' saved successfully for case {case_number}.",
        "note": note_res.data[0],
    }


# ─── GET /api/documents/:id ─────────────────────────────

@router.get("/{doc_id}")
async def get_document(doc_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("document")
        .select("*")
        .eq("id", doc_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return result.data

# ─── DELETE /api/documents/:id ──────────────────────────

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, current_user=Depends(get_lawyer)):
    supabase.table("document").delete().eq("id", doc_id).eq("firm_id", current_user["firm_id"]).execute()
    return {"message": "Document deleted"}

# ─── PATCH /api/documents/:id/status ────────────────────

@router.patch("/{doc_id}/status")
async def update_document_status(doc_id: str, status: DocumentStatus, current_user=Depends(get_lawyer)):
    result = supabase.table("document").update({
        "status":      status,
        "reviewed_by": current_user["id"],
        "reviewed_at": "now()",
    }).eq("id", doc_id).eq("firm_id", current_user["firm_id"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return result.data[0]

# ─── POST /api/documents/:id/share ──────────────────────

@router.post("/{doc_id}/share")
async def share_document(doc_id: str, current_user=Depends(get_lawyer)):
    result = supabase.table("document").update({
        "is_shared_with_client": True
    }).eq("id", doc_id).eq("firm_id", current_user["firm_id"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_data = result.data[0]
    supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    "DOCUMENT_SHARED",
        "title":   "Document Shared with Client",
        "message": f"{doc_data.get('file_name', 'A document')} has been shared with the client.",
    }).execute()

    return {"message": "Document shared with client"}

# ─── POST /api/documents/:id/ai-summarize ───────────────

@router.post("/{doc_id}/ai-summarize")
async def ai_summarize_document(doc_id: str, current_user=Depends(get_lawyer)):
    doc = (
        supabase.table("document")
        .select("*")
        .eq("id", doc_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found")

    openai_client = _get_openai()
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": (
                f"Summarize this legal document titled '{doc.data['file_name']}'. "
                "Extract and structure: key clauses, parties involved, important dates, "
                "obligations, and any potential issues or deadlines."
            ),
        }],
        max_tokens=1500,
    )
    summary = response.choices[0].message.content

    saved = supabase.table("ai_summary").insert({
        "document_id": doc_id,
        "summary":     summary,
        "lawyer_id":   current_user["id"],
    }).execute()

    supabase.table("document").update({"ai_categorized": True}).eq("id", doc_id).execute()

    return {"summary": summary, "ai_summary_id": saved.data[0]["id"]}
