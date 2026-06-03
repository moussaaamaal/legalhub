import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: Optional[redis.ConnectionPool] = None


def _get_pool() -> redis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
    return _pool


def _client() -> redis.Redis:
    return redis.Redis(connection_pool=_get_pool())


# ── Sync helpers — appelés depuis les fonctions sync (thread pool FastAPI) ──

def sync_cache_get(key: str) -> Any:
    try:
        value = _client().get(key)
        return json.loads(value) if value else None
    except Exception as e:
        logger.debug("Redis get [%s]: %s", key, e)
        return None


def sync_cache_set(key: str, value: Any, ttl: int = 60) -> None:
    try:
        _client().set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as e:
        logger.debug("Redis set [%s]: %s", key, e)


def sync_cache_delete(key: str) -> None:
    try:
        _client().delete(key)
    except Exception as e:
        logger.debug("Redis delete [%s]: %s", key, e)


def sync_is_blacklisted(token: str) -> bool:
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    return sync_cache_get(f"blacklist:{token_hash}") is not None


def sync_check_rate_limit(key: str, max_requests: int, window: int) -> bool:
    try:
        client = _client()
        count = client.incr(key)
        if count == 1:
            client.expire(key, window)
        return count > max_requests
    except Exception as e:
        logger.debug("Redis rate_limit [%s]: %s", key, e)
        return False  # Redis down → on laisse passer


# ── Async wrappers — pour les route handlers async ──────────────────────────

async def cache_get(key: str) -> Any:
    return await asyncio.to_thread(sync_cache_get, key)


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    await asyncio.to_thread(sync_cache_set, key, value, ttl)


async def cache_delete(key: str) -> None:
    await asyncio.to_thread(sync_cache_delete, key)


async def cache_delete_pattern(pattern: str) -> None:
    def _delete():
        client = _client()
        cursor = 0
        while True:
            cursor, keys = client.scan(cursor, match=pattern, count=200)
            if keys:
                client.delete(*keys)
            if cursor == 0:
                break
    try:
        await asyncio.to_thread(_delete)
    except Exception as e:
        logger.debug("Redis delete_pattern [%s]: %s", pattern, e)


async def check_rate_limit(key: str, max_requests: int, window: int) -> bool:
    return await asyncio.to_thread(sync_check_rate_limit, key, max_requests, window)


async def blacklist_token(token: str, exp: int) -> None:
    ttl = max(1, exp - int(datetime.now(timezone.utc).timestamp()))
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    await asyncio.to_thread(sync_cache_set, f"blacklist:{token_hash}", 1, ttl)


async def is_token_blacklisted(token: str) -> bool:
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    return await asyncio.to_thread(sync_is_blacklisted, token)


async def ping() -> bool:
    try:
        return await asyncio.to_thread(_client().ping)
    except Exception:
        return False
