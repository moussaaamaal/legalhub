import logging
import httpx
from fastapi import HTTPException
from app.core.config import settings

logger = logging.getLogger(__name__)

MISTRAL_BASE = "https://api.mistral.ai/v1"


def _headers() -> dict:
    if not settings.MISTRAL_API_KEY:
        raise HTTPException(status_code=503, detail="Mistral API key not configured")
    return {
        "Authorization": f"Bearer {settings.MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }


async def embed_texts(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{MISTRAL_BASE}/embeddings",
            headers=_headers(),
            json={"model": settings.EMBEDDING_MODEL, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()
        return [item["embedding"] for item in data["data"]]


async def embed_query(query: str) -> list[float]:
    results = await embed_texts([query])
    return results[0]


async def ocr_by_url(url: str, file_name: str, file_type: str) -> str:
    """
    Extract text from a document using its public Supabase URL via Mistral OCR.
    Uses URL directly — no base64, no size limit.
    """
    ft = (file_type or "").upper()

    if ft == "PDF":
        document = {"type": "document_url", "document_url": url}
    elif ft == "IMAGE":
        document = {"type": "image_url", "image_url": url}
    else:
        return ""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{MISTRAL_BASE}/ocr",
                headers=_headers(),
                json={"model": "mistral-ocr-latest", "document": document},
            )
            resp.raise_for_status()
            pages = resp.json().get("pages", [])
            text = "\n\n".join(p.get("markdown", "") for p in pages)
            logger.info(f"Mistral OCR: {file_name} → {len(text)} chars ({len(pages)} page(s))")
            return text
    except Exception as e:
        logger.warning(f"Mistral OCR failed for {file_name}: {e}")
        return ""
