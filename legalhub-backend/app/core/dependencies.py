import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from app.core.security import decode_token
from app.core.database import supabase
from app.core.cache import sync_cache_get, sync_cache_set, sync_is_blacklisted

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    if sync_is_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked"
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    cached = sync_cache_get(f"user:{user_id}")
    if cached:
        if not cached["is_active"]:
            raise HTTPException(status_code=403, detail="Account deactivated")
        return cached

    # Récupérer l'utilisateur depuis Supabase
    try:
        result = supabase.table("app_user").select("*").eq("id", user_id).single().execute()
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        logger.error("Supabase connection error in get_current_user: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable, please retry"
        )
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found")

    user = result.data
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated")

    sync_cache_set(f"user:{user_id}", user, ttl=60)
    return user


def require_role(*roles: str):
    def checker(current_user=Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {list(roles)}"
            )
        return current_user
    return checker


# Raccourcis pratiques
def get_firm_admin(user=Depends(require_role("FIRM_ADMIN", "SUPER_ADMIN"))):
    return user

def get_lawyer(user=Depends(require_role("LAWYER", "FIRM_ADMIN", "SUPER_ADMIN"))):
    return user

def get_any_user(user=Depends(get_current_user)):
    return user
