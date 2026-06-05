import logging
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer
from app.core.database import supabase, supabase_admin
from app.core.config import settings
from app.services.embedding_service import ocr_by_url
from app.services.case_ingestion import _extract_text, _parse_storage_url
from langchain_mistralai import ChatMistralAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI"])


def _detect_doc_language(text: str) -> str:
    """Detect primary language: Arabic, French, or English."""
    sample = text[:3000]
    alpha = [c for c in sample if c.isalpha()]
    if not alpha:
        return "English"
    total = len(alpha)
    arabic = sum(1 for c in alpha if '؀' <= c <= 'ۿ')
    french_specific = sum(1 for c in alpha if c in 'àâäéèêëîïôùûüçœæÀÂÄÉÈÊËÎÏÔÙÛÜÇŒÆ')
    if arabic / total > 0.20:
        return "Arabic"
    if french_specific / total > 0.015:
        return "French"
    return "English"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    document_id: str

class DraftContractRequest(BaseModel):
    template_type: str
    parameters: dict
    case_id: Optional[str] = None

class CaseAssistantRequest(BaseModel):
    case_id: Optional[str] = None
    question: str

class SuggestActionsRequest(BaseModel):
    case_id: str


# ─── Mistral helper ───────────────────────────────────────────────────────────

async def _mistral_chat(
    messages: list[dict],
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    if not settings.MISTRAL_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    llm = ChatMistralAI(
        model=settings.RAG_CHAT_MODEL,
        api_key=settings.MISTRAL_API_KEY,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    lc_messages = []
    for m in messages:
        role, content = m.get("role"), m.get("content", "")
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
    response = await llm.ainvoke(lc_messages)
    return response.content


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/summarize")
async def summarize_document(body: SummarizeRequest, current_user=Depends(get_lawyer)):
    # Verify the document belongs to the lawyer's firm via the linked case
    doc_res = supabase_admin.table("document") \
        .select("*, case_file!inner(firm_id)") \
        .eq("id", body.document_id) \
        .single().execute()
    doc = doc_res.data
    if not doc or (doc.get("case_file") or {}).get("firm_id") != current_user["firm_id"]:
        raise HTTPException(status_code=404, detail="Document not found")

    # Download and extract text from the actual file
    url       = doc.get("storage_url", "")
    file_type = doc.get("file_type", "")
    file_name = doc.get("file_name", "")
    doc_text  = ""

    if url:
        try:
            bucket, path = _parse_storage_url(url)
            file_bytes   = supabase_admin.storage.from_(bucket).download(path)
            doc_text     = _extract_text(file_bytes, file_type)
            if not doc_text.strip():
                doc_text = await ocr_by_url(url, file_name, file_type)
        except Exception as e:
            logger.warning(f"Document extraction failed for {body.document_id}: {e}")

    if not doc_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this document. The file may be empty or in an unsupported format.",
        )

    detected_lang = _detect_doc_language(doc_text)

    if detected_lang == "Arabic":
        lang_rule = "اكتب الملخص كاملاً باللغة العربية. استخدم عناوين الأقسام بالعربية فقط."
        add_translation = True
    elif detected_lang == "French":
        lang_rule = "Rédigez le résumé entièrement en français. Utilisez des titres de section en français uniquement."
        add_translation = True
    else:
        lang_rule = "Write the summary in English only. Do not add any translation or separator."
        add_translation = False

    translation_rule = (
        "After the summary, add '---' on its own line, then '## English Summary', "
        "then a complete English translation of the summary above."
        if add_translation else
        "Do NOT add any '---' separator or English translation — one summary only."
    )

    summary = await _mistral_chat(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional multilingual legal assistant. "
                    "You summarize legal documents accurately and follow output rules exactly."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Summarize this legal document: '{file_name}'.\n\n"
                    f"LANGUAGE RULE (mandatory): {lang_rule}\n\n"
                    "Include a section ONLY if you found actual content for it in the document.\n"
                    "If no content: skip the section entirely — no title, no placeholder text.\n"
                    "NEVER write: N/A, None, Not specified, Non spécifié, Non mentionné, "
                    "غير محدد, لا يوجد, or any similar placeholder.\n\n"
                    "Sections (include only if content found):\n"
                    "  - Document type\n"
                    "  - Parties\n"
                    "  - Main subject\n"
                    "  - Key clauses / obligations\n"
                    "  - Important dates\n"
                    "  - Potential issues\n\n"
                    f"{translation_rule}\n\n"
                    f"DOCUMENT:\n{doc_text[:15000]}"
                ),
            },
        ],
        max_tokens=1500,
    )

    supabase.table("ai_summary").insert({
        "document_id": body.document_id,
        "summary":     summary,
        "lawyer_id":   current_user["id"],
    }).execute()

    return {"summary": summary}


@router.post("/draft-contract")
async def draft_contract(body: DraftContractRequest, current_user=Depends(get_lawyer)):
    params_str = "\n".join([f"- {k}: {v}" for k, v in body.parameters.items()])

    contract = await _mistral_chat(
        messages=[
            {
                "role":    "system",
                "content": "You are an expert legal assistant. Draft professional legal contracts.",
            },
            {
                "role":    "user",
                "content": (
                    f"Draft a {body.template_type} contract with these parameters:\n"
                    f"{params_str}\n\n"
                    "Return a complete, professional legal contract."
                ),
            },
        ],
        max_tokens=3000,
        temperature=0.3,
    )

    row = {
        "lawyer_id":    current_user["id"],
        "firm_id":      current_user["firm_id"],
        "prompt":       f"Draft {body.template_type} contract",
        "output":       contract,
        "session_type": "CONTRACT_DRAFT",
    }
    if body.case_id:
        row["case_id"] = body.case_id

    session_id = None
    try:
        res = supabase.table("ai_session").insert(row).execute()
        session_id = res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.warning(f"ai_session insert failed (non-blocking): {e}")

    return {"contract": contract, "session_id": session_id}


@router.post("/suggest-actions")
async def suggest_actions(body: SuggestActionsRequest, current_user=Depends(get_lawyer)):
    case = supabase.table("case_file").select("*") \
        .eq("id", body.case_id).eq("firm_id", current_user["firm_id"]).single().execute()
    if not case.data:
        raise HTTPException(status_code=404, detail="Case not found")

    c = case.data
    suggestions = await _mistral_chat(
        messages=[
            {
                "role":    "system",
                "content": "You are an expert legal advisor. Suggest the next procedural steps for cases.",
            },
            {
                "role":    "user",
                "content": (
                    f"Case: {c['title']}\n"
                    f"Type: {c['case_type']}\n"
                    f"Status: {c['status']}\n"
                    f"Priority: {c['priority']}\n\n"
                    "What are the next 5 recommended legal steps?"
                ),
            },
        ],
        max_tokens=800,
    )
    return {"suggestions": suggestions}


@router.post("/case-assistant")
async def case_assistant(body: CaseAssistantRequest, current_user=Depends(get_lawyer)):
    if body.case_id:
        case = supabase.table("case_file").select("*") \
            .eq("id", body.case_id).eq("firm_id", current_user["firm_id"]).single().execute()
        if not case.data:
            raise HTTPException(status_code=404, detail="Case not found")
        c = case.data
        system_prompt = (
            f"You are an AI legal assistant for this case:\n"
            f"Title: {c['title']}\nType: {c['case_type']}\n"
            f"Status: {c['status']}\nDescription: {c.get('description', 'N/A')}"
        )
    else:
        system_prompt = (
            "You are an expert AI legal assistant. "
            "Help lawyers with legal questions, case strategy, document drafting, "
            "research, and procedural guidance. Be concise and professional."
        )

    answer = await _mistral_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": body.question},
        ],
        max_tokens=1024,
    )
    return {"answer": answer}


@router.get("/history")
async def ai_history(current_user=Depends(get_lawyer)):
    result = supabase.table("ai_session").select("*") \
        .eq("lawyer_id", current_user["id"]) \
        .order("created_at", desc=True) \
        .limit(50).execute()
    return result.data


# ─── Extract deadlines & dates ────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    document_id: str

@router.post("/extract")
async def extract_deadlines(body: ExtractRequest, current_user=Depends(get_lawyer)):
    doc_res = supabase_admin.table("document") \
        .select("*, case_file!inner(firm_id)") \
        .eq("id", body.document_id) \
        .single().execute()
    doc = doc_res.data
    if not doc or (doc.get("case_file") or {}).get("firm_id") != current_user["firm_id"]:
        raise HTTPException(status_code=404, detail="Document not found")

    url       = doc.get("storage_url", "")
    file_type = doc.get("file_type", "")
    file_name = doc.get("file_name", "")
    doc_text  = ""

    if url:
        try:
            bucket, path = _parse_storage_url(url)
            file_bytes   = supabase_admin.storage.from_(bucket).download(path)
            doc_text     = _extract_text(file_bytes, file_type)
            if not doc_text.strip():
                doc_text = await ocr_by_url(url, file_name, file_type)
        except Exception as e:
            logger.warning(f"Document extraction failed for {body.document_id}: {e}")

    if not doc_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from this document.")

    result = await _mistral_chat(
        messages=[
            {
                "role":    "system",
                "content": "You are a legal assistant specialized in extracting key dates and deadlines from legal documents.",
            },
            {
                "role": "user",
                "content": (
                    f"Extract all important dates, deadlines, and time-sensitive obligations "
                    f"from this legal document: '{file_name}'.\n\n"
                    "## Key Dates & Deadlines\n"
                    "For each date or deadline found, list:\n"
                    "- **Date**: [the date or period]\n"
                    "- **Event / Obligation**: [what must happen on or by that date]\n"
                    "- **Party**: [who is responsible, if stated]\n\n"
                    "## Notice Periods & Durations\n"
                    "List any notice periods, contract durations, or time limits.\n\n"
                    "Only include sections where you found relevant content. "
                    "Never write N/A, None, or placeholder text.\n\n"
                    f"DOCUMENT:\n{doc_text[:15000]}"
                ),
            },
        ],
        max_tokens=1500,
    )

    supabase.table("ai_summary").insert({
        "document_id": body.document_id,
        "summary":     result,
        "lawyer_id":   current_user["id"],
    }).execute()

    return {"result": result, "document_name": file_name}


# ─── Deep document analysis ───────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    document_id: str

@router.post("/analyze")
async def analyze_document(body: AnalyzeRequest, current_user=Depends(get_lawyer)):
    doc_res = supabase_admin.table("document") \
        .select("*, case_file!inner(firm_id)") \
        .eq("id", body.document_id) \
        .single().execute()
    doc = doc_res.data
    if not doc or (doc.get("case_file") or {}).get("firm_id") != current_user["firm_id"]:
        raise HTTPException(status_code=404, detail="Document not found")

    url       = doc.get("storage_url", "")
    file_type = doc.get("file_type", "")
    file_name = doc.get("file_name", "")
    doc_text  = ""

    if url:
        try:
            bucket, path = _parse_storage_url(url)
            file_bytes   = supabase_admin.storage.from_(bucket).download(path)
            doc_text     = _extract_text(file_bytes, file_type)
            if not doc_text.strip():
                doc_text = await ocr_by_url(url, file_name, file_type)
        except Exception as e:
            logger.warning(f"Document extraction failed for {body.document_id}: {e}")

    if not doc_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from this document.")

    detected_lang = _detect_doc_language(doc_text)
    if detected_lang == "Arabic":
        lang_rule = "اكتب التحليل كاملاً باللغة العربية."
    elif detected_lang == "French":
        lang_rule = "Rédigez l'analyse entièrement en français."
    else:
        lang_rule = "Write the analysis in English."

    result = await _mistral_chat(
        messages=[
            {
                "role":    "system",
                "content": "You are a senior legal analyst. Provide deep, professional analysis of legal documents.",
            },
            {
                "role": "user",
                "content": (
                    f"Perform a deep legal analysis of this document: '{file_name}'.\n\n"
                    f"LANGUAGE RULE (mandatory): {lang_rule}\n\n"
                    "Structure your analysis as follows:\n"
                    "## Document Overview\n"
                    "Type, purpose, parties involved.\n\n"
                    "## Key Clauses\n"
                    "Critical provisions and their legal implications.\n\n"
                    "## Legal Risks\n"
                    "Potential issues, gaps, or unfavorable terms.\n\n"
                    "## Obligations\n"
                    "What each party must do.\n\n"
                    "## Recommendations\n"
                    "Suggested changes or points to negotiate.\n\n"
                    "Include a section only if you found relevant content. "
                    "Never write N/A, None, or placeholder text.\n\n"
                    f"DOCUMENT:\n{doc_text[:15000]}"
                ),
            },
        ],
        max_tokens=2000,
    )

    supabase.table("ai_summary").insert({
        "document_id": body.document_id,
        "summary":     result,
        "lawyer_id":   current_user["id"],
    }).execute()

    return {"result": result, "document_name": file_name}


# ─── AI usage meter ───────────────────────────────────────────────────────────

@router.get("/usage")
async def get_ai_usage(current_user=Depends(get_lawyer)):
    from datetime import datetime, timezone
    now         = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    summaries_res = supabase.table("ai_summary").select("id", count="exact") \
        .eq("lawyer_id", current_user["id"]) \
        .gte("created_at", month_start).execute()

    sessions_res = supabase.table("ai_session").select("id", count="exact") \
        .eq("lawyer_id", current_user["id"]) \
        .gte("created_at", month_start).execute()

    used = (summaries_res.count or 0) + (sessions_res.count or 0)

    # Contract template usage for this firm (all time)
    contract_res = supabase.table("ai_session").select("prompt") \
        .eq("firm_id", current_user["firm_id"]) \
        .eq("session_type", "CONTRACT_DRAFT").execute()

    template_stats: dict[str, int] = {}
    for s in (contract_res.data or []):
        prompt = (s.get("prompt") or "").lower()
        for t in ["Employment", "Service Agreement", "NDA", "Lease"]:
            if t.lower() in prompt:
                template_stats[t] = template_stats.get(t, 0) + 1

    return {
        "used":           used,
        "limit":          100,
        "period":         now.strftime("%B %Y"),
        "template_stats": template_stats,
    }
