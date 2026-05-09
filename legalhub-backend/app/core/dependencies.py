from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import decode_token
from app.core.database import supabase

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

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Récupérer l'utilisateur depuis Supabase
    result = supabase.table("app_user").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found")

    user = result.data
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated")

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