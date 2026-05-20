import logging
import httpx
from app.core.config import settings
from app.services.milvus_client import get_or_create_collection
from app.services.embedding_service import embed_query, _headers, MISTRAL_BASE

logger = logging.getLogger(__name__)

_SYSTEM = """You are an expert legal assistant integrated into LegalHub.
You assist the lawyer managing the case whose context is provided below.

STRICT RULES:
1. Base your answers ONLY on the context between <CONTEXT> and </CONTEXT>.
2. If the information is not in the context, clearly state: "I don't have this information in the case file."
3. Always cite the source: "According to the timeline...", "Based on document X...", "From the tasks...".
4. Respond in English, professionally and concisely.
5. Never fabricate facts, dates, amounts, or names.

<CONTEXT>
{context}
</CONTEXT>"""

_SOURCE_LABELS = {
    "case_meta": "Case Overview",
    "document":  "Document",
    "timeline":  "Case Timeline",
    "tasks":     "Tasks",
    "invoices":  "Invoices",
    "events":    "Hearings / Events",
    "notes":     "Notes",
    "client":    "Client Profile",
    "lawyer":    "Team Member",
}

_LAWYER_SYSTEM = """You are an expert legal assistant integrated into LegalHub.
You have access to the cases, clients, tasks, invoices, hearings, and documents assigned to you.

STRICT RULES:
1. Base your answers ONLY on the context between <CONTEXT> and </CONTEXT>.
2. If the information is not in the context, clearly state: "I don't have this information in your case files."
3. Always cite the source when possible: "In case X...", "According to the tasks in case Y...", "From the invoices...".
4. When listing cases, always mention their title and number.
5. Respond in the same language as the question, professionally and concisely.
6. Never fabricate facts, dates, amounts, or names.
7. The chunk labeled "YOUR PROFILE (you are this lawyer)" is the profile of the person asking the question — use it to answer questions like "who am I", "what is my name", "what is my email".
8. Chunks labeled "COLLEAGUE / TEAM MEMBER" are other lawyers the user works with — use them to answer "who do I work with", but NEVER include the user themselves in that list.

<CONTEXT>
{context}
</CONTEXT>"""

_FIRM_SYSTEM = """You are an expert legal assistant integrated into LegalHub.
You have full visibility across ALL cases, clients, tasks, invoices, hearings, and documents of this law firm.

STRICT RULES:
1. Base your answers ONLY on the context between <CONTEXT> and </CONTEXT>.
2. If the information is not in the context, clearly state: "I don't have this information in the firm data."
3. Always cite the source when possible: "In case X...", "Client Y's profile shows...", "According to the invoices...".
4. When listing cases or clients, include their names/numbers.
5. Respond in the same language as the question, professionally and concisely.
6. Never fabricate facts, dates, amounts, or names.

<CONTEXT>
{context}
</CONTEXT>"""


async def retrieve_chunks(case_id: str, firm_id: str, query: str) -> list[dict]:
    collection = get_or_create_collection()
    vec = await embed_query(query)

    results = collection.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 128}},
        limit=settings.RAG_TOP_K,
        expr=f'case_id == "{case_id}" && firm_id == "{firm_id}"',
        output_fields=["chunk_text", "source_type", "source_id"],
    )

    chunks = []
    for hit in results[0]:
        chunks.append({
            "text":        hit.entity.get("chunk_text", ""),
            "source_type": hit.entity.get("source_type", ""),
            "source_id":   hit.entity.get("source_id", ""),
            "score":       round(float(hit.score), 4),
        })
    return chunks


def _format_context(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        label = _SOURCE_LABELS.get(c["source_type"], c["source_type"])
        parts.append(f"[Source {i} — {label}]\n{c['text']}")
    return "\n\n---\n\n".join(parts)


async def answer_case_question(
    case_id: str,
    firm_id: str,
    question: str,
    chat_history: list[dict] | None = None,
) -> dict:
    """
    Full RAG pipeline:
    1. Retrieve top-k relevant chunks from Milvus
    2. Build grounded context
    3. Call GPT-4o
    4. Return answer + sources
    """
    chunks = await retrieve_chunks(case_id, firm_id, question)

    if not chunks:
        return {
            "answer": "No context found for this case. Please index the case first using the 'Re-index' button.",
            "sources": [],
            "chunks_used": 0,
        }

    context = _format_context(chunks)
    system_msg = _SYSTEM.format(context=context)

    messages = [{"role": "system", "content": system_msg}]
    for m in (chat_history or [])[-6:]:
        if m.get("role") in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{MISTRAL_BASE}/chat/completions",
            headers=_headers(),
            json={
                "model": settings.RAG_CHAT_MODEL,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()
    answer = resp.json()["choices"][0]["message"]["content"]

    sources = [
        {
            "source_type":      c["source_type"],
            "source_id":        c["source_id"],
            "relevance_score":  c["score"],
            "source_label":     _SOURCE_LABELS.get(c["source_type"], c["source_type"]),
            "excerpt":          c["text"][:220] + "…" if len(c["text"]) > 220 else c["text"],
        }
        for c in chunks
    ]

    return {"answer": answer, "sources": sources, "chunks_used": len(chunks)}


async def retrieve_scoped_chunks(firm_id: str, case_ids: list[str], query: str) -> list[dict]:
    """Search chunks restricted to a specific set of case_ids (for non-admin lawyers)."""
    if not case_ids:
        return []
    collection = get_or_create_collection()
    vec = await embed_query(query)

    ids_expr = "[" + ", ".join(f'"{cid}"' for cid in case_ids) + "]"
    expr = f'firm_id == "{firm_id}" && case_id in {ids_expr}'

    results = collection.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 128}},
        limit=settings.RAG_TOP_K,
        expr=expr,
        output_fields=["chunk_text", "source_type", "source_id", "case_id"],
    )

    chunks = []
    for hit in results[0]:
        chunks.append({
            "text":        hit.entity.get("chunk_text", ""),
            "source_type": hit.entity.get("source_type", ""),
            "source_id":   hit.entity.get("source_id", ""),
            "case_id":     hit.entity.get("case_id", ""),
            "score":       round(float(hit.score), 4),
        })
    return chunks


async def answer_scoped_question(
    firm_id: str,
    case_ids: list[str],
    question: str,
    chat_history: list[dict] | None = None,
) -> dict:
    chunks = await retrieve_scoped_chunks(firm_id, case_ids, question)

    if not chunks:
        return {
            "answer": "No data found for your cases. Please index your data first using the 'Re-index' button.",
            "sources": [],
            "chunks_used": 0,
        }

    context = _format_context(chunks)
    system_msg = _LAWYER_SYSTEM.format(context=context)

    messages = [{"role": "system", "content": system_msg}]
    for m in (chat_history or [])[-6:]:
        if m.get("role") in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{MISTRAL_BASE}/chat/completions",
            headers=_headers(),
            json={
                "model": settings.RAG_CHAT_MODEL,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()
    answer = resp.json()["choices"][0]["message"]["content"]

    sources = [
        {
            "source_type":     c["source_type"],
            "source_id":       c["source_id"],
            "case_id":         c["case_id"],
            "relevance_score": c["score"],
            "source_label":    _SOURCE_LABELS.get(c["source_type"], c["source_type"]),
            "excerpt":         c["text"][:220] + "…" if len(c["text"]) > 220 else c["text"],
        }
        for c in chunks
    ]

    return {"answer": answer, "sources": sources, "chunks_used": len(chunks)}


async def retrieve_firm_chunks(firm_id: str, query: str) -> list[dict]:
    collection = get_or_create_collection()
    vec = await embed_query(query)

    results = collection.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 128}},
        limit=settings.RAG_TOP_K,
        expr=f'firm_id == "{firm_id}"',
        output_fields=["chunk_text", "source_type", "source_id", "case_id"],
    )

    chunks = []
    for hit in results[0]:
        chunks.append({
            "text":        hit.entity.get("chunk_text", ""),
            "source_type": hit.entity.get("source_type", ""),
            "source_id":   hit.entity.get("source_id", ""),
            "case_id":     hit.entity.get("case_id", ""),
            "score":       round(float(hit.score), 4),
        })
    return chunks


async def answer_firm_question(
    firm_id: str,
    question: str,
    chat_history: list[dict] | None = None,
) -> dict:
    chunks = await retrieve_firm_chunks(firm_id, question)

    if not chunks:
        return {
            "answer": "No firm data found. Please index your firm data first using the 'Re-index' button.",
            "sources": [],
            "chunks_used": 0,
        }

    context = _format_context(chunks)
    system_msg = _FIRM_SYSTEM.format(context=context)

    messages = [{"role": "system", "content": system_msg}]
    for m in (chat_history or [])[-6:]:
        if m.get("role") in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{MISTRAL_BASE}/chat/completions",
            headers=_headers(),
            json={
                "model": settings.RAG_CHAT_MODEL,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()
    answer = resp.json()["choices"][0]["message"]["content"]

    sources = [
        {
            "source_type":     c["source_type"],
            "source_id":       c["source_id"],
            "case_id":         c["case_id"],
            "relevance_score": c["score"],
            "source_label":    _SOURCE_LABELS.get(c["source_type"], c["source_type"]),
            "excerpt":         c["text"][:220] + "…" if len(c["text"]) > 220 else c["text"],
        }
        for c in chunks
    ]

    return {"answer": answer, "sources": sources, "chunks_used": len(chunks)}
