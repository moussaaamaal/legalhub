"""
RAG service for contract drafting.
Queries the legalhub_contracts Milvus collection built from
multilingual legal data (Qatar, Egypt, Maghreb, GCC, MultiLegalPile FR).
"""

import logging
from app.services.embedding_service import embed_query
from app.core.config import settings

logger = logging.getLogger(__name__)

CONTRACTS_COLLECTION = "legalhub_contracts"
DEFAULT_TOP_K = 8


def _get_collection():
    from pymilvus import connections, Collection
    connections.connect(
        alias="default",
        host=settings.MILVUS_HOST,
        port=settings.MILVUS_PORT,
    )
    col = Collection(CONTRACTS_COLLECTION)
    col.load()
    return col


async def retrieve_legal_context(
    contract_type: str,
    answers: dict,
    lang: str = "ar",
    country_code: str | None = None,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict]:
    """
    Retrieve relevant legal clauses and contract templates from Milvus.
    Returns a list of chunks ranked by semantic similarity.
    """
    # Build a rich query from contract type + collected answers
    query_parts = [f"contrat {contract_type}"]
    if country_code:
        query_parts.append(f"droit {country_code}")
    for key, value in answers.items():
        if value and isinstance(value, str):
            query_parts.append(f"{key}: {value}")
    query_text = " | ".join(query_parts)

    try:
        query_embedding = await embed_query(query_text)
    except Exception as e:
        logger.warning(f"Embedding failed for contract RAG query: {e}")
        return []

    try:
        col = _get_collection()
        filters = []
        if lang:
            filters.append(f'lang == "{lang}"')
        if country_code:
            filters.append(f'country_code == "{country_code.upper()}"')
        expr = " && ".join(filters) if filters else None

        results = col.search(
            data=[query_embedding],
            anns_field="embedding",
            param={"metric_type": "COSINE", "params": {"ef": 64}},
            limit=top_k,
            expr=expr,
            output_fields=["id", "country_code", "lang", "contract_type", "source", "title", "chunk_text"],
        )

        hits = []
        for r in results[0]:
            hits.append({
                "chunk_text":    r.entity.get("chunk_text", ""),
                "contract_type": r.entity.get("contract_type", ""),
                "country_code":  r.entity.get("country_code", ""),
                "lang":          r.entity.get("lang", ""),
                "source":        r.entity.get("source", ""),
                "title":         r.entity.get("title", ""),
                "score":         round(r.distance, 4),
            })

        # If no results with country filter, retry without it
        if not hits and country_code:
            logger.info(f"No results for {country_code}, retrying without country filter")
            results2 = col.search(
                data=[query_embedding],
                anns_field="embedding",
                param={"metric_type": "COSINE", "params": {"ef": 64}},
                limit=top_k,
                expr=f'lang == "{lang}"' if lang else None,
                output_fields=["id", "country_code", "lang", "contract_type", "source", "title", "chunk_text"],
            )
            for r in results2[0]:
                hits.append({
                    "chunk_text":    r.entity.get("chunk_text", ""),
                    "contract_type": r.entity.get("contract_type", ""),
                    "country_code":  r.entity.get("country_code", ""),
                    "lang":          r.entity.get("lang", ""),
                    "source":        r.entity.get("source", ""),
                    "title":         r.entity.get("title", ""),
                    "score":         round(r.distance, 4),
                })

        logger.info(f"Contract RAG: {len(hits)} chunks retrieved for type={contract_type} lang={lang}")
        return hits

    except Exception as e:
        logger.warning(f"Contract RAG search failed: {e}")
        return []


def build_rag_context(chunks: list[dict], max_chars: int = 6000) -> str:
    """Format retrieved chunks into a readable context block."""
    if not chunks:
        return ""

    parts = []
    total = 0
    for chunk in chunks:
        text = chunk.get("chunk_text", "")
        source = chunk.get("source", "")
        ct = chunk.get("contract_type", "")
        if total + len(text) > max_chars:
            break
        parts.append(f"[Source: {source} | Type: {ct}]\n{text}")
        total += len(text)

    return "\n\n---\n\n".join(parts)
