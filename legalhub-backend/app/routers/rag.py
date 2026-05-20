import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

from app.core.dependencies import get_lawyer
from app.core.database import supabase, supabase_admin
from app.services.case_ingestion import ingest_case, ingest_firm, ingest_lawyer_scope
from app.services.rag_service import answer_case_question, answer_firm_question, answer_scoped_question
from app.services.embedding_service import _headers, MISTRAL_BASE
from app.core.config import settings

router = APIRouter(prefix="/api/rag", tags=["RAG"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    case_id: str

class AskRequest(BaseModel):
    case_id: str
    question: str
    chat_history: Optional[list[dict]] = []

class TitleRequest(BaseModel):
    question: str
    answer: str

class FirmAskRequest(BaseModel):
    question: str
    chat_history: Optional[list[dict]] = []


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _verify_case_access(case_id: str, firm_id: str):
    res = supabase_admin.table("case_file").select("id").eq("id", case_id).eq("firm_id", firm_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Case not found")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_case_endpoint(
    body: IngestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    _verify_case_access(body.case_id, firm_id)
    background_tasks.add_task(ingest_case, body.case_id, firm_id)
    return {"message": "Indexing started", "case_id": body.case_id}


@router.post("/ask")
async def ask_question(
    body: AskRequest,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    _verify_case_access(body.case_id, firm_id)

    result = await answer_case_question(
        case_id=body.case_id,
        firm_id=firm_id,
        question=body.question,
        chat_history=body.chat_history,
    )

    # Persist Q&A in session history
    try:
        supabase.table("ai_session").insert({
            "lawyer_id":    current_user["id"],
            "firm_id":      firm_id,
            "case_id":      body.case_id,
            "session_type": "CASE_RAG",
            "prompt":       body.question,
            "output":       result["answer"],
        }).execute()
    except Exception as e:
        logger.warning(f"ai_session insert failed (non-blocking): {e}")

    return result


@router.post("/session-title")
async def generate_session_title(
    body: TitleRequest,
    current_user: dict = Depends(get_lawyer),
):
    """Generate a short title (5-7 words) summarising the first Q&A of a session."""
    prompt = (
        "You are a legal assistant. Write a session title of 4 to 6 words for this Q&A exchange.\n"
        "The title must reflect what was FOUND or REVEALED in the answer — not just repeat the question.\n"
        "Rules: 4-6 words max, no quotes, no punctuation at end, same language as the question.\n\n"
        f"Question: {body.question[:250]}\n"
        f"Answer: {body.answer[:500]}\n\n"
        "Title:"
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{MISTRAL_BASE}/chat/completions",
                headers=_headers(),
                json={
                    "model": settings.RAG_CHAT_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 20,
                },
            )
            resp.raise_for_status()
            title = resp.json()["choices"][0]["message"]["content"].strip().strip('"\'').strip()
            return {"title": title or None}
    except Exception as e:
        logger.warning(f"session-title generation failed: {e}")
        return {"title": None}  # mobile will keep "New conversation"


@router.get("/history/{case_id}")
async def session_history(
    case_id: str,
    limit: int = 30,
    current_user: dict = Depends(get_lawyer),
):
    """Return past Q&A sessions for a case, most recent first."""
    firm_id = current_user["firm_id"]
    _verify_case_access(case_id, firm_id)

    res = supabase.table("ai_session") \
        .select("id, prompt, output, created_at") \
        .eq("case_id", case_id) \
        .eq("firm_id", firm_id) \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()

    return res.data or []


@router.get("/status/{case_id}")
async def index_status(
    case_id: str,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    _verify_case_access(case_id, firm_id)

    from app.services.milvus_client import get_or_create_collection
    collection = get_or_create_collection()

    rows = collection.query(
        expr=f'case_id == "{case_id}" && firm_id == "{firm_id}"',
        output_fields=["source_type"],
        limit=2000,
    )

    by_source: dict[str, int] = {}
    for r in rows:
        st = r.get("source_type", "unknown")
        by_source[st] = by_source.get(st, 0) + 1

    return {
        "case_id":          case_id,
        "is_indexed":       len(rows) > 0,
        "total_chunks":     len(rows),
        "chunks_by_source": by_source,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_admin(user: dict) -> bool:
    return user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

def _get_lawyer_case_ids(user_id: str, firm_id: str) -> list[str]:
    res = (
        supabase_admin.table("case_team")
        .select("case_id, case_file!inner(firm_id)")
        .eq("user_id", user_id)
        .eq("case_file.firm_id", firm_id)
        .execute()
    )
    return [r["case_id"] for r in (res.data or [])]


# ─── Firm-wide / scoped endpoints ─────────────────────────────────────────────

@router.post("/firm/ingest")
async def ingest_firm_endpoint(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    if _is_admin(current_user):
        background_tasks.add_task(ingest_firm, firm_id)
        return {"message": "Firm-wide indexing started", "scope": "firm"}
    else:
        lawyer_id = current_user["id"]
        background_tasks.add_task(ingest_lawyer_scope, lawyer_id, firm_id)
        return {"message": "Indexing your cases", "scope": "lawyer"}


@router.post("/firm/ask")
async def ask_firm_question(
    body: FirmAskRequest,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]

    if _is_admin(current_user):
        result = await answer_firm_question(
            firm_id=firm_id,
            question=body.question,
            chat_history=body.chat_history,
        )
    else:
        case_ids = _get_lawyer_case_ids(current_user["id"], firm_id)
        # Include sentinel so client/lawyer profiles are also searched
        scope_ids = case_ids + [f"__lawyer_{current_user['id']}__"]
        result = await answer_scoped_question(
            firm_id=firm_id,
            case_ids=scope_ids,
            question=body.question,
            chat_history=body.chat_history,
        )

    try:
        supabase.table("ai_session").insert({
            "lawyer_id":    current_user["id"],
            "firm_id":      firm_id,
            "session_type": "FIRM_RAG",
            "prompt":       body.question,
            "output":       result["answer"],
        }).execute()
    except Exception as e:
        logger.warning(f"ai_session insert failed (non-blocking): {e}")
    return result


@router.get("/firm/status")
async def firm_index_status(
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    from app.services.milvus_client import get_or_create_collection
    collection = get_or_create_collection()

    if _is_admin(current_user):
        expr = f'firm_id == "{firm_id}"'
    else:
        case_ids = _get_lawyer_case_ids(current_user["id"], firm_id)
        sentinel  = f"__lawyer_{current_user['id']}__"
        scope_ids = case_ids + [sentinel]
        ids_expr  = "[" + ", ".join(f'"{cid}"' for cid in scope_ids) + "]"
        expr = f'firm_id == "{firm_id}" && case_id in {ids_expr}'

    rows = collection.query(expr=expr, output_fields=["source_type"], limit=10000)
    by_source: dict[str, int] = {}
    for r in rows:
        st = r.get("source_type", "unknown")
        by_source[st] = by_source.get(st, 0) + 1
    return {
        "firm_id":          firm_id,
        "is_indexed":       len(rows) > 0,
        "total_chunks":     len(rows),
        "chunks_by_source": by_source,
    }


@router.delete("/index/{case_id}")
async def delete_index(
    case_id: str,
    current_user: dict = Depends(get_lawyer),
):
    firm_id = current_user["firm_id"]
    _verify_case_access(case_id, firm_id)

    from app.services.milvus_client import get_or_create_collection
    collection = get_or_create_collection()
    collection.delete(f'case_id == "{case_id}" && firm_id == "{firm_id}"')
    return {"message": "Index deleted", "case_id": case_id}
