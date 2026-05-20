import uuid
import io
import logging
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from docx import Document as DocxDocument

from app.core.config import settings
from app.core.database import supabase_admin
from app.services.milvus_client import get_or_create_collection
from app.services.embedding_service import embed_texts, ocr_by_url

logger = logging.getLogger(__name__)

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=settings.RAG_CHUNK_SIZE,
    chunk_overlap=settings.RAG_CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


# ─── Text extractors ──────────────────────────────────────────────────────────

def _extract_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except Exception as e:
        logger.warning(f"PDF extraction failed: {e}")
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        doc = DocxDocument(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        logger.warning(f"DOCX extraction failed: {e}")
        return ""


def _extract_text(data: bytes, file_type: str) -> str:
    ft = (file_type or "").lower()
    if "pdf" in ft:
        return _extract_pdf(data)
    if "docx" in ft or "word" in ft or "officedocument" in ft:
        return _extract_docx(data)
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


# ─── Text builders ────────────────────────────────────────────────────────────

def _case_meta_text(case: dict) -> str:
    client = case.get("client") or {}
    client_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()
    return (
        f"CASE: {case.get('title', '')}\n"
        f"Number: {case.get('case_number', '')}\n"
        f"Type: {case.get('case_type', '')}\n"
        f"Practice Area: {case.get('practice_area', '')}\n"
        f"Status: {case.get('status', '')}\n"
        f"Priority: {case.get('priority', '')}\n"
        f"Client: {client_name} | {client.get('email', '')} | {client.get('phone', '')}\n"
        f"Opposing Party: {case.get('opposing_party', '')}\n"
        f"Opposing Counsel: {case.get('opposing_counsel', '')}\n"
        f"Filing Date: {case.get('filing_date', '')}\n"
        f"First Hearing Date: {case.get('first_hearing_date', '')}\n"
        f"Court: {case.get('court_name', '')} — {case.get('court_location', '')}\n"
        f"Judge: {case.get('judge_name', '')}\n"
        f"Prosecutor: {case.get('prosecutor_name', '')}\n"
        f"Estimated Value: {case.get('estimated_value', '')} {case.get('currency', 'TND')}\n"
        f"Billing Type: {case.get('billing_type', '')}\n"
        f"Progress: {case.get('progress_percent', '')}%\n"
        f"Description: {case.get('description', '')}"
    )


def _timeline_text(events: list[dict]) -> str:
    lines = ["CASE TIMELINE:"]
    for ev in events:
        lines.append(
            f"- [{(ev.get('created_at') or '')[:10]}] "
            f"{ev.get('action', '')}: {ev.get('description', '')}"
        )
    return "\n".join(lines)


def _tasks_text(tasks: list[dict]) -> str:
    lines = ["CASE TASKS:"]
    for t in tasks:
        lines.append(
            f"- [{t.get('status', '')}] {t.get('title', '')} | "
            f"Priority: {t.get('priority', '')} | Due: {t.get('due_date', '')} | "
            f"Description: {t.get('description', '')}"
        )
    return "\n".join(lines)


def _invoices_text(invoices: list[dict]) -> str:
    lines = ["CASE INVOICES:"]
    paid    = sum(i.get("total_amount", 0) or 0 for i in invoices if i.get("status") == "PAID")
    pending = sum(i.get("total_amount", 0) or 0 for i in invoices if i.get("status") in ("PENDING", "OVERDUE"))
    total   = sum(i.get("total_amount", 0) or 0 for i in invoices)
    lines.append(f"Total billed: {total} | Paid: {paid} | Pending/Overdue: {pending}")
    for inv in invoices:
        items = inv.get("invoice_item") or []
        items_txt = ""
        if items:
            items_txt = " | Items: " + "; ".join(
                f"{it.get('description', '')} ×{it.get('quantity', 1)} = {it.get('total', 0)}"
                for it in items
            )
        lines.append(
            f"- {inv.get('invoice_number', '')} | "
            f"Status: {inv.get('status', '')} | "
            f"Total: {inv.get('total_amount', 0)} {inv.get('currency', '')} | "
            f"Subtotal: {inv.get('subtotal', 0)} | Tax: {inv.get('tax_amount', 0)} | "
            f"Issued: {inv.get('issue_date', '')} | Due: {inv.get('due_date', '')}"
            + items_txt
        )
    return "\n".join(lines)


def _events_text(events: list[dict]) -> str:
    lines = ["HEARINGS AND EVENTS:"]
    for ev in events:
        dt = (ev.get("start_datetime") or "")[:16].replace("T", " ")
        lines.append(
            f"- [{ev.get('event_type', '')}] {ev.get('title', '')} | "
            f"Date: {dt} | Location: {ev.get('location', '') or 'Not specified'}"
        )
    return "\n".join(lines)


def _notes_text(notes: list[dict]) -> str:
    lines = ["CASE NOTES:"]
    for n in notes:
        if not n.get("is_voice_note"):
            lines.append(f"- [{(n.get('created_at') or '')[:10]}] {n.get('content', '')}")
    return "\n".join(lines)


def _parse_storage_url(url: str) -> tuple[str, str]:
    """Return (bucket, path) from a Supabase Storage public URL."""
    parts = url.split("/object/public/")
    if len(parts) == 2:
        rest = parts[1].split("/", 1)
        if len(rest) == 2:
            return rest[0], rest[1]
    raise ValueError(f"Cannot parse Supabase Storage URL: {url}")


# ─── People text builders ────────────────────────────────────────────────────

def _lawyer_text(lawyer: dict, is_self: bool = False) -> str:
    name = f"{lawyer.get('first_name', '')} {lawyer.get('last_name', '')}".strip()
    label = "YOUR PROFILE (you are this lawyer)" if is_self else "COLLEAGUE / TEAM MEMBER"
    return (
        f"{label}: {name}\n"
        f"Role: {lawyer.get('role', '')}\n"
        f"Email: {lawyer.get('email', '')}\n"
        f"Phone: {lawyer.get('phone', '') or ''}\n"
        f"Status: {'Active' if lawyer.get('is_active') else 'Inactive'}"
    )


def _client_text(client: dict) -> str:
    name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()
    return (
        f"CLIENT PROFILE: {name}\n"
        f"Email: {client.get('email', '')}\n"
        f"Phone: {client.get('phone', '')}\n"
        f"Address: {client.get('address', '')}\n"
        f"Date of Birth: {client.get('date_of_birth', '')}\n"
        f"Status: {client.get('status', '')}\n"
        f"Notes: {client.get('notes', '')}"
    )


# ─── Main ingestion ───────────────────────────────────────────────────────────

async def ingest_case(case_id: str, firm_id: str) -> int:
    """
    Index (or re-index) all data for a case into Milvus.
    Returns the number of chunks inserted.
    """
    # Fetch all data in parallel-ish (sync client, so sequential)
    case_res = supabase_admin.table("case_file").select(
        "*, client:client_id(first_name, last_name, email, phone)"
    ).eq("id", case_id).eq("firm_id", firm_id).single().execute()

    if not case_res.data:
        logger.warning(f"ingest_case: case {case_id} not found")
        return 0

    docs_res     = supabase_admin.table("document").select("*").eq("case_id", case_id).execute()
    timeline_res = supabase_admin.table("case_timeline").select("*").eq("case_id", case_id).order("created_at").execute()
    tasks_res    = supabase_admin.table("task").select("*").eq("case_id", case_id).execute()
    invoices_res = supabase_admin.table("invoice").select("*, invoice_item(*)").eq("case_id", case_id).execute()
    events_res   = supabase_admin.table("calendar_event").select("*").eq("case_id", case_id).order("start_datetime").execute()
    notes_res    = supabase_admin.table("note").select("*").eq("case_id", case_id).order("created_at").execute()

    case      = case_res.data
    documents = docs_res.data or []
    timeline  = timeline_res.data or []
    tasks     = tasks_res.data or []
    invoices  = invoices_res.data or []
    events    = events_res.data or []
    notes     = [n for n in (notes_res.data or []) if not n.get("is_voice_note")]

    collection = get_or_create_collection()

    # Delete old chunks for this case (clean re-index)
    try:
        collection.delete(f'case_id == "{case_id}" && firm_id == "{firm_id}"')
    except Exception as e:
        logger.warning(f"Could not delete old chunks: {e}")

    ids, firm_ids, case_ids, source_types, source_ids, texts = [], [], [], [], [], []

    def _add(text: str, stype: str, sid: str):
        for chunk in _splitter.split_text(text):
            chunk = chunk.strip()
            if chunk:
                ids.append(str(uuid.uuid4()))
                firm_ids.append(firm_id)
                case_ids.append(case_id)
                source_types.append(stype)
                source_ids.append(sid)
                texts.append(chunk[:4096])

    # 1 — Case metadata (title, client, court, parties, dates, value)
    _add(_case_meta_text(case), "case_meta", case_id)

    # 2 — Timeline
    if timeline:
        _add(_timeline_text(timeline), "timeline", case_id)

    # 3 — Tasks
    if tasks:
        _add(_tasks_text(tasks), "tasks", case_id)

    # 4 — Invoices (actual billing data from DB — more reliable than documents)
    if invoices:
        _add(_invoices_text(invoices), "invoices", case_id)

    # 5 — Calendar events / hearings
    if events:
        _add(_events_text(events), "events", case_id)

    # 6 — Notes
    if notes:
        _add(_notes_text(notes), "notes", case_id)

    # 7 — Documents (download + extract text)
    for doc in documents:
        url = doc.get("storage_url", "")
        name = doc.get("file_name", doc.get("id", "?"))
        file_type = doc.get("file_type", "")
        if not url:
            logger.warning(f"[doc] {name}: no storage_url, skipped")
            continue
        try:
            bucket, path = _parse_storage_url(url)
            file_bytes = supabase_admin.storage.from_(bucket).download(path)
            text = _extract_text(file_bytes, file_type)
            chars = len(text.strip())

            # Fallback: Mistral OCR for scanned PDFs and images
            if chars == 0:
                logger.info(f"[doc] {name}: no text from pypdf/docx — trying Mistral OCR via URL")
                text = await ocr_by_url(url, name, file_type)
                chars = len(text.strip())

            if chars > 0:
                header = (
                    f"DOCUMENT: {name} | "
                    f"Category: {doc.get('category', '')} | "
                    f"Status: {doc.get('status', '')}\n"
                )
                _add(header + text, "document", doc["id"])
                logger.info(f"[doc] {name}: indexed {chars} chars ({file_type})")
            else:
                logger.warning(f"[doc] {name}: no text extracted even with OCR ({file_type})")
        except Exception as e:
            logger.warning(f"[doc] {name}: failed — {e}")

    if not texts:
        return 0

    # Generate embeddings in batches of 50
    embeddings: list[list[float]] = []
    for i in range(0, len(texts), 50):
        embeddings.extend(await embed_texts(texts[i:i + 50]))

    collection.insert([ids, firm_ids, case_ids, source_types, source_ids, texts, embeddings])
    collection.flush()

    logger.info(f"Ingested {len(texts)} chunks for case {case_id}")
    return len(texts)


async def ingest_lawyer_scope(lawyer_id: str, firm_id: str) -> dict:
    """
    Index all data accessible to a specific lawyer:
    - Their assigned cases (via case_team), each handled by ingest_case
    - Full client profiles for clients in those cases
    - Team member (lawyer) profiles from those cases
    Non-case data is stored with case_id='__lawyer_{lawyer_id}__' (sentinel)
    so the scoped query can include them without leaking to other lawyers.
    """
    team_res = supabase_admin.table("case_team").select("case_id, case_file!inner(firm_id)") \
        .eq("user_id", lawyer_id).eq("case_file.firm_id", firm_id).execute()
    case_ids = [r["case_id"] for r in (team_res.data or [])]

    sentinel = f"__lawyer_{lawyer_id}__"
    collection = get_or_create_collection()

    # Delete old sentinel (non-case) chunks for this lawyer
    try:
        collection.delete(f'case_id == "{sentinel}"')
    except Exception as e:
        logger.warning(f"ingest_lawyer_scope: could not delete old sentinel chunks: {e}")

    # Collect unique client_ids from the lawyer's cases
    client_ids: set[str] = set()
    for cid in case_ids:
        try:
            cr = supabase_admin.table("case_file").select("client_id") \
                .eq("id", cid).single().execute()
            if cr.data and cr.data.get("client_id"):
                client_ids.add(cr.data["client_id"])
        except Exception as e:
            logger.warning(f"ingest_lawyer_scope: client_id fetch failed for case {cid}: {e}")

    # Fetch ALL active firm members so the lawyer knows everyone (including admin)
    firm_members_res = supabase_admin.table("app_user").select("*") \
        .eq("firm_id", firm_id).eq("is_active", True).execute()
    firm_members = firm_members_res.data or []

    ids, firm_ids_col, c_ids_col, src_types, src_ids, texts = [], [], [], [], [], []

    def _add_sentinel(text: str, stype: str, sid: str):
        for chunk in _splitter.split_text(text):
            chunk = chunk.strip()
            if chunk:
                ids.append(str(uuid.uuid4()))
                firm_ids_col.append(firm_id)
                c_ids_col.append(sentinel)
                src_types.append(stype)
                src_ids.append(sid)
                texts.append(chunk[:4096])

    # Index every firm member — self with special label, others as colleagues
    colleague_ids: set[str] = set()
    for member in firm_members:
        is_self = member["id"] == lawyer_id
        _add_sentinel(_lawyer_text(member, is_self=is_self), "lawyer", member["id"])
        if not is_self:
            colleague_ids.add(member["id"])

    # Full client profiles
    if client_ids:
        clients_res = supabase_admin.table("client").select("*") \
            .in_("id", list(client_ids)).execute()
        for client in (clients_res.data or []):
            _add_sentinel(_client_text(client), "client", client["id"])

    # Standalone calendar events (no case_id) accessible to this lawyer
    part_res = supabase_admin.table("calendar_event_participant").select("event_id") \
        .eq("user_id", lawyer_id).execute()
    participant_event_ids = {r["event_id"] for r in (part_res.data or [])}

    created_res = supabase_admin.table("calendar_event").select("*") \
        .eq("firm_id", firm_id).eq("created_by", lawyer_id).is_("case_id", "null").execute()
    standalone = created_res.data or []

    if participant_event_ids:
        seen_ids = {ev["id"] for ev in standalone}
        extra_ids = [eid for eid in participant_event_ids if eid not in seen_ids]
        if extra_ids:
            extra_res = supabase_admin.table("calendar_event").select("*") \
                .in_("id", extra_ids).is_("case_id", "null").execute()
            standalone.extend(extra_res.data or [])

    if standalone:
        standalone.sort(key=lambda e: e.get("start_datetime") or "")
        _add_sentinel(_events_text(standalone), "events", f"standalone_{lawyer_id}")

    non_case_chunks = 0
    if texts:
        embeddings: list[list[float]] = []
        for i in range(0, len(texts), 50):
            embeddings.extend(await embed_texts(texts[i:i + 50]))
        collection.insert([ids, firm_ids_col, c_ids_col, src_types, src_ids, texts, embeddings])
        collection.flush()
        non_case_chunks = len(texts)

    # Index each case (handles its own delete + re-index)
    case_chunks = 0
    for cid in case_ids:
        try:
            n = await ingest_case(cid, firm_id)
            case_chunks += n
        except Exception as e:
            logger.warning(f"ingest_lawyer_scope: failed on case {cid}: {e}")

    total = non_case_chunks + case_chunks
    logger.info(
        f"ingest_lawyer_scope done — {total} chunks "
        f"({non_case_chunks} profiles + {case_chunks} case) "
        f"for lawyer {lawyer_id}, {len(case_ids)} cases, "
        f"{len(client_ids)} clients, {len(colleague_ids)} colleagues"
    )
    return {
        "cases_indexed":    len(case_ids),
        "clients_indexed":  len(client_ids),
        "colleagues_indexed": len(colleague_ids),
        "total_chunks":     total,
    }


async def ingest_firm(firm_id: str) -> dict:
    """
    Index (or re-index) the entire firm: all client profiles + every case.
    Client chunks use case_id='__firm__' so they don't pollute case-specific queries.
    Returns counts of what was indexed.
    """
    clients_res = supabase_admin.table("client").select("*").eq("firm_id", firm_id).execute()
    cases_res   = supabase_admin.table("case_file").select("id").eq("firm_id", firm_id).execute()
    clients     = clients_res.data or []
    all_cases   = [c["id"] for c in (cases_res.data or [])]

    collection = get_or_create_collection()

    # Wipe everything for this firm, then rebuild from scratch
    try:
        collection.delete(f'firm_id == "{firm_id}"')
    except Exception as e:
        logger.warning(f"ingest_firm: could not delete old chunks: {e}")

    lawyers_res = supabase_admin.table("app_user").select("*") \
        .eq("firm_id", firm_id).eq("is_active", True).execute()
    lawyers = lawyers_res.data or []

    ids, firm_ids_col, case_ids_col, source_types_col, source_ids_col, texts = [], [], [], [], [], []

    def _add_firm(text: str, stype: str, sid: str):
        for chunk in _splitter.split_text(text):
            chunk = chunk.strip()
            if chunk:
                ids.append(str(uuid.uuid4()))
                firm_ids_col.append(firm_id)
                case_ids_col.append("__firm__")
                source_types_col.append(stype)
                source_ids_col.append(sid)
                texts.append(chunk[:4096])

    for client in clients:
        _add_firm(_client_text(client), "client", client["id"])

    for lawyer in lawyers:
        _add_firm(_lawyer_text(lawyer), "lawyer", lawyer["id"])

    # Standalone calendar events (no case_id)
    standalone_events_res = supabase_admin.table("calendar_event").select("*") \
        .eq("firm_id", firm_id).is_("case_id", "null").order("start_datetime").execute()
    standalone_events = standalone_events_res.data or []
    if standalone_events:
        _add_firm(_events_text(standalone_events), "events", "__firm_events__")

    profile_chunks = 0
    if texts:
        embeddings: list[list[float]] = []
        for i in range(0, len(texts), 50):
            embeddings.extend(await embed_texts(texts[i:i + 50]))
        collection.insert([ids, firm_ids_col, case_ids_col, source_types_col, source_ids_col, texts, embeddings])
        collection.flush()
        profile_chunks = len(texts)
        logger.info(f"ingest_firm: {profile_chunks} profile chunks ({len(clients)} clients + {len(lawyers)} lawyers)")

    case_chunks = 0
    for cid in all_cases:
        try:
            n = await ingest_case(cid, firm_id)
            case_chunks += n
        except Exception as e:
            logger.warning(f"ingest_firm: failed on case {cid}: {e}")

    logger.info(
        f"ingest_firm done — {profile_chunks} profile + {case_chunks} case chunks, "
        f"{len(all_cases)} cases, {len(clients)} clients, {len(lawyers)} lawyers"
    )
    return {
        "clients_indexed": len(clients),
        "lawyers_indexed": len(lawyers),
        "cases_indexed":   len(all_cases),
        "profile_chunks":  profile_chunks,
        "case_chunks":     case_chunks,
        "total_chunks":    profile_chunks + case_chunks,
    }


async def ingest_standalone_events(firm_id: str, lawyer_id: str | None = None) -> int:
    """
    Re-index only standalone (no case_id) calendar events.
    - lawyer_id=None  → updates the __firm__ sentinel (admin view)
    - lawyer_id=<id>  → updates the __lawyer_{id}__ sentinel (scoped view)
    Called after create/update/delete of calendar events with no case_id.
    """
    collection = get_or_create_collection()

    ids, firm_ids_col, case_ids_col, src_types, src_ids, texts = [], [], [], [], [], []

    if lawyer_id:
        sentinel = f"__lawyer_{lawyer_id}__"

        # Delete only the event chunks inside this lawyer's sentinel
        try:
            collection.delete(f'case_id == "{sentinel}" && source_type == "events"')
        except Exception as e:
            logger.warning(f"ingest_standalone_events: delete failed for sentinel {sentinel}: {e}")

        # Events created by this lawyer with no case_id
        created_res = supabase_admin.table("calendar_event").select("*") \
            .eq("firm_id", firm_id).eq("created_by", lawyer_id).is_("case_id", "null").execute()
        events = created_res.data or []

        # Events where lawyer is a participant (not created by them)
        part_res = supabase_admin.table("calendar_event_participant").select("event_id") \
            .eq("user_id", lawyer_id).execute()
        participant_event_ids = {r["event_id"] for r in (part_res.data or [])}
        if participant_event_ids:
            seen_ids = {ev["id"] for ev in events}
            extra_ids = [eid for eid in participant_event_ids if eid not in seen_ids]
            if extra_ids:
                extra_res = supabase_admin.table("calendar_event").select("*") \
                    .in_("id", extra_ids).is_("case_id", "null").execute()
                events.extend(extra_res.data or [])

        events.sort(key=lambda e: e.get("start_datetime") or "")
    else:
        sentinel = "__firm__"

        # Delete only the event chunks inside the firm sentinel
        try:
            collection.delete(f'firm_id == "{firm_id}" && case_id == "__firm__" && source_type == "events"')
        except Exception as e:
            logger.warning(f"ingest_standalone_events: delete failed for __firm__: {e}")

        events_res = supabase_admin.table("calendar_event").select("*") \
            .eq("firm_id", firm_id).is_("case_id", "null").order("start_datetime").execute()
        events = events_res.data or []

    if not events:
        logger.info(f"ingest_standalone_events: no standalone events (firm={firm_id}, lawyer={lawyer_id})")
        return 0

    def _add(text: str, stype: str, sid: str):
        for chunk in _splitter.split_text(text):
            chunk = chunk.strip()
            if chunk:
                ids.append(str(uuid.uuid4()))
                firm_ids_col.append(firm_id)
                case_ids_col.append(sentinel)
                src_types.append(stype)
                src_ids.append(sid)
                texts.append(chunk[:4096])

    _add(_events_text(events), "events", sentinel)

    if not texts:
        return 0

    embeddings: list[list[float]] = []
    for i in range(0, len(texts), 50):
        embeddings.extend(await embed_texts(texts[i:i + 50]))

    collection.insert([ids, firm_ids_col, case_ids_col, src_types, src_ids, texts, embeddings])
    collection.flush()

    logger.info(f"ingest_standalone_events: {len(texts)} chunks, sentinel={sentinel}, {len(events)} events")
    return len(texts)
