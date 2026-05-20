import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, EmailStr
from app.core.database import supabase, supabase_admin
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, create_2fa_pending_token, decode_token
from app.core.dependencies import get_current_user, get_firm_admin, get_lawyer
from app.models.enums import UserRole
import pyotp
import httpx

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# ─── Schemas ────────────────────────────────────────────

class RegisterFirmRequest(BaseModel):
    firm_name: str
    legal_entity_type: str
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class Setup2FAResponse(BaseModel):
    secret: str
    qr_code_url: str

class Verify2FARequest(BaseModel):
    code: str

class Login2FARequest(BaseModel):
    temp_token: str
    code: str

class InviteLawyerRequest(BaseModel):
    email: EmailStr
    full_name: str

class InviteClientRequest(BaseModel):
    email: EmailStr
    full_name: str
    phone: str | None = None

class ValidateOfficeCodeRequest(BaseModel):
    code: str
    email: EmailStr
    password: str
    full_name: str

class AcceptInviteRequest(BaseModel):
    invite_token: str
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None

class UpdateMeRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class NotificationPreferencesRequest(BaseModel):
    hearing_reminders: bool | None = None
    hearing_reminder_offset: str | None = None
    task_reminders: bool | None = None
    document_updates: bool | None = None
    client_messages: bool | None = None
    payment_notifications: bool | None = None
    email_notifications: bool | None = None
    whatsapp_updates: bool | None = None

class OAuthLoginRequest(BaseModel):
    provider: str       # "google" | "microsoft" | "apple"
    token: str          # id_token or access_token from the provider
    token_type: str = "id_token"  # "id_token" | "access_token"
    hearing_reminders: bool | None = None
    hearing_reminder_offset: str | None = None
    task_reminders: bool | None = None
    document_updates: bool | None = None
    client_messages: bool | None = None
    payment_notifications: bool | None = None
    email_notifications: bool | None = None
    whatsapp_updates: bool | None = None

# ─── POST /api/auth/register-firm ───────────────────────

@router.post("/register-firm", status_code=201)
async def register_firm(body: RegisterFirmRequest):
    existing_user = supabase.table("app_user").select("id").eq("email", body.email).execute()
    if existing_user.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_firm = supabase.table("firm").select("id").eq("email", body.email).execute()
    if existing_firm.data:
        raise HTTPException(status_code=400, detail="A firm with this email already exists")

    office_code = secrets.token_hex(4).upper()

    firm = supabase.table("firm").insert({
        "name": body.firm_name,
        "legal_entity_type": body.legal_entity_type,
        "email": body.email,
        "phone": body.phone,
        "office_code": office_code,
    }).execute()

    firm_id = firm.data[0]["id"]

    user_result = supabase.table("app_user").insert({
        "firm_id": firm_id,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": UserRole.FIRM_ADMIN,
        "full_name": body.full_name,
        "phone": body.phone,
    }).execute()

    admin_user = user_result.data[0]

    supabase.table("lawyer").insert({
        "user_id": admin_user["id"],
        "firm_id": firm_id,
        "title": "Firm Admin",
    }).execute()

    supabase.table("subscription").insert({
        "firm_id": firm_id,
        "plan_name": "Free",
        "ai_credits_limit": 100,
        "max_lawyers": 3,
        "max_storage_gb": 10,
        "start_date": datetime.now(timezone.utc).date().isoformat(),
    }).execute()

    token_data = {"sub": admin_user["id"], "firm_id": firm_id, "role": admin_user["role"]}
    return {
        "message": "Firm registered successfully",
        "firm_id": firm_id,
        "office_code": office_code,
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": admin_user["id"],
            "email": admin_user["email"],
            "full_name": admin_user["full_name"],
            "role": admin_user["role"],
            "firm_id": firm_id,
            "firm_name": body.firm_name,
            "avatar_url": None,
            "two_fa_enabled": False,
        }
    }

# ─── POST /api/auth/login ───────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    result = supabase.table("app_user").select("*").eq("email", body.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found")

    user = result.data[0]
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Wrong password")

    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("app_user").update({"last_login_at": now}).eq("id", user["id"]).execute()

    # Record login history (requires login_history table — see SQL migration)
    try:
        supabase.table("login_history").insert({
            "user_id": user["id"],
            "logged_in_at": now,
        }).execute()
    except Exception:
        pass

    # If 2FA is enabled, issue a short-lived pending token — don't give full access yet
    if user.get("two_fa_enabled"):
        return {
            "requires_2fa": True,
            "temp_token": create_2fa_pending_token(user["id"]),
        }

    token_data = {"sub": user["id"], "firm_id": user["firm_id"], "role": user["role"]}

    # Fetch firm name to include in login response
    firm_result = supabase.table("firm").select("name").eq("id", user["firm_id"]).single().execute()
    firm_name = firm_result.data["name"] if firm_result.data else None

    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "firm_id": user["firm_id"],
            "firm_name": firm_name,
            "avatar_url": user.get("avatar_url"),
            "phone": user.get("phone"),
            "two_fa_enabled": user["two_fa_enabled"],
            "last_login_at": user.get("last_login_at"),
        }
    }

# ─── POST /api/auth/oauth/token ─────────────────────────

async def _verify_google_id_token(id_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    d = resp.json()
    return {"email": d.get("email"), "name": d.get("name"), "provider_id": d.get("sub")}

async def _verify_google_access_token(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google access token")
    d = resp.json()
    return {"email": d.get("email"), "name": d.get("name"), "provider_id": d.get("sub")}

async def _verify_microsoft_access_token(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Microsoft token")
    d = resp.json()
    email = d.get("mail") or d.get("userPrincipalName", "")
    return {"email": email, "name": d.get("displayName"), "provider_id": d.get("id")}

async def _verify_supabase_token(access_token: str) -> dict:
    from app.core.config import settings
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "apikey": settings.SUPABASE_ANON_KEY,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token Supabase invalide ou expiré")
    d = resp.json()
    return {
        "email": d.get("email"),
        "name": (d.get("user_metadata") or {}).get("full_name"),
        "provider_id": d.get("id"),
    }

def _decode_apple_identity_token(identity_token: str) -> dict:
    from jose import jwt as _jwt
    try:
        payload = _jwt.decode(
            identity_token,
            key="",
            algorithms=["RS256"],
            options={"verify_signature": False, "verify_exp": False},
        )
        return {"email": payload.get("email"), "provider_id": payload.get("sub")}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

@router.post("/oauth/token")
async def oauth_token_login(body: OAuthLoginRequest):
    if body.provider == "supabase":
        info = await _verify_supabase_token(body.token)
    elif body.provider == "google":
        if body.token_type == "access_token":
            info = await _verify_google_access_token(body.token)
        else:
            info = await _verify_google_id_token(body.token)
    elif body.provider == "microsoft":
        info = await _verify_microsoft_access_token(body.token)
    elif body.provider == "apple":
        info = _decode_apple_identity_token(body.token)
    else:
        raise HTTPException(status_code=400, detail="Unsupported provider. Use: google, microsoft, apple")

    email = (info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="OAuth provider did not return an email address")

    result = supabase.table("app_user").select("*").eq("email", email).execute()
    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=f"No LegalHub account found for {email}. Please register first or contact your administrator.",
        )

    user = result.data[0]
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated. Contact support.")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("app_user").update({"last_login_at": now}).eq("id", user["id"]).execute()

    try:
        supabase.table("login_history").insert({
            "user_id": user["id"],
            "logged_in_at": now,
            "login_method": body.provider,
        }).execute()
    except Exception:
        pass

    firm_result = supabase.table("firm").select("name").eq("id", user["firm_id"]).single().execute()
    firm_name = firm_result.data["name"] if firm_result.data else None

    token_data = {"sub": user["id"], "firm_id": user["firm_id"], "role": user["role"]}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "firm_id": user["firm_id"],
            "firm_name": firm_name,
            "avatar_url": user.get("avatar_url"),
            "phone": user.get("phone"),
            "two_fa_enabled": user.get("two_fa_enabled", False),
            "last_login_at": user.get("last_login_at"),
        },
    }

# ─── POST /api/auth/refresh ────────────────────────────

@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_data = {"sub": payload["sub"], "firm_id": payload["firm_id"], "role": payload["role"]}
    return {
        "access_token": create_access_token(token_data),
        "token_type": "bearer"
    }

# ─── POST /api/auth/2fa/login ──────────────────────────
# Completes login for accounts with 2FA enabled.
# Client sends the temp_token from the login response + TOTP code.

@router.post("/2fa/login")
async def login_2fa(body: Login2FARequest):
    payload = decode_token(body.temp_token)
    if not payload or payload.get("type") != "2fa_pending":
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please log in again.")

    user_id = payload["sub"]

    # Fetch user + secret
    user_res = supabase.table("app_user").select("*").eq("id", user_id).single().execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_res.data

    secret = user.get("two_fa_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="2FA not configured")

    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=3):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    token_data = {"sub": user["id"], "firm_id": user["firm_id"], "role": user["role"]}

    firm_result = supabase.table("firm").select("name").eq("id", user["firm_id"]).single().execute()
    firm_name = firm_result.data["name"] if firm_result.data else None

    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "firm_id": user["firm_id"],
            "firm_name": firm_name,
            "avatar_url": user.get("avatar_url"),
            "phone": user.get("phone"),
            "two_fa_enabled": user["two_fa_enabled"],
            "last_login_at": user.get("last_login_at"),
        }
    }

# ─── POST /api/auth/logout ─────────────────────────────

@router.post("/logout")
async def logout(_=Depends(get_current_user)):
    return {"message": "Logged out successfully"}

# ─── GET /api/auth/me ──────────────────────────────────

@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    """Return current authenticated user profile."""
    firm_name = None
    if current_user.get("firm_id"):
        firm_res = supabase.table("firm").select("name").eq("id", current_user["firm_id"]).single().execute()
        firm_name = firm_res.data["name"] if firm_res.data else None

    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "firm_id": current_user["firm_id"],
        "firm_name": firm_name,
        "avatar_url": current_user.get("avatar_url"),
        "phone": current_user.get("phone"),
        "two_fa_enabled": current_user["two_fa_enabled"],
        "is_active": current_user["is_active"],
        "last_login_at": current_user.get("last_login_at"),
        "created_at": current_user.get("created_at"),
    }

# ─── PUT /api/auth/me ──────────────────────────────────

@router.put("/me")
async def update_me(body: UpdateMeRequest, current_user=Depends(get_current_user)):
    """Update current user's full_name and/or phone."""
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table("app_user").update(data).eq("id", current_user["id"]).execute()
    updated = result.data[0]
    firm_res = supabase.table("firm").select("name").eq("id", updated["firm_id"]).single().execute()
    firm_name = firm_res.data["name"] if firm_res.data else None
    return {
        "id": updated["id"],
        "email": updated["email"],
        "full_name": updated["full_name"],
        "role": updated["role"],
        "firm_id": updated["firm_id"],
        "firm_name": firm_name,
        "avatar_url": updated.get("avatar_url"),
        "phone": updated.get("phone"),
        "two_fa_enabled": updated["two_fa_enabled"],
    }

# ─── DELETE /api/auth/me ───────────────────────────────

@router.delete("/me", status_code=200)
async def delete_account(current_user=Depends(get_current_user)):
    """Permanently deactivate and anonymise the current user's account."""
    user_id = current_user["id"]
    supabase.table("app_user").update({
        "is_active": False,
        "full_name": "Deleted User",
        "email": f"deleted_{user_id}@legalhub.invalid",
        "phone": None,
        "avatar_url": None,
        "password_hash": "",
    }).eq("id", user_id).execute()
    return {"detail": "Account deleted"}

# ─── PUT /api/auth/change-password ─────────────────────

@router.put("/change-password")
async def change_password(body: ChangePasswordRequest, current_user=Depends(get_current_user)):
    """Change password for the authenticated user."""
    if not verify_password(body.current_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    supabase.table("app_user").update({
        "password_hash": hash_password(body.new_password)
    }).eq("id", current_user["id"]).execute()
    return {"message": "Password changed successfully"}

# ─── POST /api/auth/avatar ─────────────────────────────
# Requires Supabase Storage bucket "avatars" (public read)

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP images are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    path = f"{current_user['id']}/avatar.{ext}"  # fixed path per user — upsert replaces it

    try:
        # upsert=True: creates if not exists, overwrites if exists
        # Use admin client to bypass Storage RLS
        supabase_admin.storage.from_("avatars").upload(
            path, content,
            {"content-type": content_type, "upsert": "true"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    avatar_url = supabase_admin.storage.from_("avatars").get_public_url(path)

    supabase.table("app_user").update({"avatar_url": avatar_url}).eq("id", current_user["id"]).execute()

    return {"avatar_url": avatar_url}

# ─── GET /api/auth/login-history ───────────────────────
# Requires Supabase migration:
# CREATE TABLE login_history (
#   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
#   user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
#   logged_in_at TIMESTAMPTZ DEFAULT NOW()
# );

@router.get("/login-history")
async def get_login_history(current_user=Depends(get_current_user)):
    try:
        result = (
            supabase.table("login_history")
            .select("id, logged_in_at")
            .eq("user_id", current_user["id"])
            .order("logged_in_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception:
        return []

# ─── GET /api/auth/notification-preferences ────────────
# Requires Supabase migration:
# CREATE TABLE notification_preferences (
#   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
#   user_id UUID REFERENCES app_user(id) ON DELETE CASCADE UNIQUE,
#   push_notifications BOOLEAN DEFAULT TRUE,
#   hearing_reminders BOOLEAN DEFAULT TRUE,
#   hearing_reminder_offset TEXT DEFAULT '1 hour before',
#   task_reminders BOOLEAN DEFAULT TRUE,
#   document_updates BOOLEAN DEFAULT TRUE,
#   client_messages BOOLEAN DEFAULT TRUE,
#   payment_notifications BOOLEAN DEFAULT TRUE,
#   email_notifications BOOLEAN DEFAULT FALSE,
#   whatsapp_updates BOOLEAN DEFAULT TRUE
# );

NOTIF_DEFAULTS = {
    "hearing_reminders": True,
    "hearing_reminder_offset": "1 hour before",
    "task_reminders": True,
    "document_updates": True,
    "client_messages": True,
    "payment_notifications": True,
    "email_notifications": False,
    "whatsapp_updates": True,
}

@router.get("/notification-preferences")
async def get_notification_preferences(current_user=Depends(get_current_user)):
    try:
        result = supabase.table("notification_preferences").select("*").eq("user_id", current_user["id"]).execute()
        return result.data[0] if result.data else NOTIF_DEFAULTS
    except Exception:
        return NOTIF_DEFAULTS

@router.put("/notification-preferences")
async def update_notification_preferences(body: NotificationPreferencesRequest, current_user=Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    try:
        existing = supabase.table("notification_preferences").select("id").eq("user_id", current_user["id"]).execute()
        if existing.data:
            result = supabase.table("notification_preferences").update(data).eq("user_id", current_user["id"]).execute()
        else:
            result = supabase.table("notification_preferences").insert({**NOTIF_DEFAULTS, **data, "user_id": current_user["id"]}).execute()
        return result.data[0]
    except Exception:
        # Table doesn't exist yet — return merged defaults silently
        return {**NOTIF_DEFAULTS, **data}

# ─── POST /api/auth/2fa/setup ──────────────────────────

@router.post("/2fa/setup", response_model=Setup2FAResponse)
async def setup_2fa(current_user=Depends(get_current_user)):
    import logging
    log = logging.getLogger(__name__)

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    qr_url = totp.provisioning_uri(current_user["email"], issuer_name="LegalHub")

    res = supabase.table("app_user").update({
        "two_fa_secret": secret
    }).eq("id", current_user["id"]).execute()
    print(f"[2fa/setup] user={current_user['id']} secret_saved={bool(res.data)} secret_preview={secret[:6]}...", flush=True)

    return {"secret": secret, "qr_code_url": qr_url}

# ─── POST /api/auth/2fa/verify ─────────────────────────

@router.post("/2fa/verify")
async def verify_2fa(body: Verify2FARequest, current_user=Depends(get_current_user)):
    import logging
    log = logging.getLogger(__name__)

    # Fetch fresh from DB — get_current_user does not include two_fa_secret
    user_res = supabase.table("app_user").select("two_fa_secret").eq("id", current_user["id"]).single().execute()
    secret = user_res.data.get("two_fa_secret") if user_res.data else None
    print(f"[2fa/verify] user={current_user['id']} secret_found={bool(secret)} code_received='{body.code}'", flush=True)

    if not secret:
        raise HTTPException(status_code=400, detail="2FA not set up. Please run setup first.")

    totp = pyotp.TOTP(secret)
    expected = totp.now()
    print(f"[2fa/verify] expected_code={expected}", flush=True)

    if not totp.verify(body.code, valid_window=3):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    supabase.table("app_user").update({"two_fa_enabled": True}).eq("id", current_user["id"]).execute()
    return {"message": "2FA enabled successfully"}

# ─── POST /api/auth/forgot-password ────────────────────

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    result = supabase.table("app_user").select("id,email,full_name").eq("email", body.email).execute()
    if not result.data:
        # Return same response to avoid email enumeration
        return {"message": "If this email exists, a reset link has been sent"}

    reset_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    # Store token in dedicated password_reset_token column
    # NOTE: Ensure columns `password_reset_token` and `password_reset_expires_at`
    # exist in the app_user table (run migration in Supabase dashboard).
    supabase.table("app_user").update({
        "password_reset_token": reset_token,
        "password_reset_expires_at": expires_at,
    }).eq("email", body.email).execute()

    # TODO: Send email via SendGrid with link:
    # f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    return {"message": "If this email exists, a reset link has been sent"}

# ─── POST /api/auth/reset-password ─────────────────────

@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    result = supabase.table("app_user").select("*").eq("password_reset_token", body.token).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user = result.data[0]
    expires_at_str = user.get("password_reset_expires_at")
    if expires_at_str:
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Reset token has expired")

    supabase.table("app_user").update({
        "password_hash": hash_password(body.new_password),
        "password_reset_token": None,
        "password_reset_expires_at": None,
    }).eq("id", user["id"]).execute()

    return {"message": "Password reset successfully"}

# ─── POST /api/auth/invite/lawyer ──────────────────────

@router.post("/invite/lawyer")
async def invite_lawyer(body: InviteLawyerRequest, current_user=Depends(get_firm_admin)):
    existing = supabase.table("app_user").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    invite_token = secrets.token_urlsafe(32)

    supabase.table("app_user").insert({
        "firm_id": current_user["firm_id"],
        "email": body.email,
        "password_hash": hash_password(invite_token),  # temporary until lawyer sets password
        "role": UserRole.LAWYER,
        "full_name": body.full_name,
        "is_active": False,
    }).execute()

    # TODO: Send invitation email via SendGrid
    return {"message": f"Invitation sent to {body.email}", "invite_token": invite_token}

# ─── POST /api/auth/invite/client ──────────────────────

@router.post("/invite/client")
async def invite_client(body: InviteClientRequest, current_user=Depends(get_lawyer)):
    # Resolve the lawyer profile linked to this app_user
    lawyer_result = supabase.table("lawyer").select("id").eq("user_id", current_user["id"]).execute()
    if not lawyer_result.data:
        raise HTTPException(status_code=400, detail="Lawyer profile not found for this user")

    lawyer_id = lawyer_result.data[0]["id"]
    invite_token = secrets.token_urlsafe(32)

    parts = body.full_name.split(maxsplit=1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    supabase.table("client").insert({
        "firm_id": current_user["firm_id"],
        "assigned_lawyer_id": lawyer_id,
        "email": body.email,
        "first_name": first_name,
        "last_name": last_name,
        "phone": body.phone,
        "invite_token": invite_token,
        "invite_status": "PENDING",
    }).execute()

    # TODO: Send invite via SendGrid / Twilio
    return {"message": f"Client invitation sent to {body.email}", "invite_token": invite_token}

# ─── POST /api/auth/office-code/validate ───────────────

@router.post("/office-code/validate")
async def validate_office_code(body: ValidateOfficeCodeRequest):
    firm = supabase.table("firm").select("*").eq("office_code", body.code).single().execute()
    if not firm.data:
        raise HTTPException(status_code=404, detail="Invalid office code")

    existing = supabase.table("app_user").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_result = supabase.table("app_user").insert({
        "firm_id": firm.data["id"],
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": UserRole.LAWYER,
        "full_name": body.full_name,
    }).execute()

    user = user_result.data[0]

    # Create lawyer profile
    supabase.table("lawyer").insert({
        "user_id": user["id"],
        "firm_id": firm.data["id"],
    }).execute()

    token_data = {"sub": user["id"], "firm_id": user["firm_id"], "role": user["role"]}
    return {
        "message": "Account created and linked to firm",
        "firm_name": firm.data["name"],
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "firm_id": user["firm_id"],
            "firm_name": firm.data["name"],
            "avatar_url": user.get("avatar_url"),
            "two_fa_enabled": user["two_fa_enabled"],
        }
    }


# ─── POST /api/auth/accept-invite (CLIENT) ─────────────

@router.post("/accept-invite")
async def accept_invite(body: AcceptInviteRequest):
    """Client accepts an invitation and creates their account."""
    # Find the client record by invite token
    client_result = supabase.table("client").select("*").eq("invite_token", body.invite_token).execute()
    if not client_result.data:
        raise HTTPException(status_code=404, detail="Invalid or expired invite token")

    client = client_result.data[0]
    if client["invite_status"] == "ACCEPTED":
        raise HTTPException(status_code=400, detail="Invite already accepted")

    # Check email matches (optional security check)
    if client["email"].lower() != body.email.lower():
        raise HTTPException(status_code=400, detail="Email does not match the invitation")

    # Check no existing user with this email
    existing = supabase.table("app_user").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create app_user for the client
    user_result = supabase.table("app_user").insert({
        "firm_id": client["firm_id"],
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": UserRole.CLIENT,
        "full_name": body.full_name,
        "phone": body.phone,
    }).execute()

    user = user_result.data[0]

    # Link client record to user account
    supabase.table("client").update({
        "user_id": user["id"],
        "invite_status": "ACCEPTED",
        "invite_token": None,
    }).eq("id", client["id"]).execute()

    # Fetch firm name
    firm_result = supabase.table("firm").select("name").eq("id", client["firm_id"]).single().execute()
    firm_name = firm_result.data["name"] if firm_result.data else None

    token_data = {"sub": user["id"], "firm_id": user["firm_id"], "role": user["role"]}
    return {
        "message": "Account activated successfully",
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "firm_id": user["firm_id"],
            "firm_name": firm_name,
            "client_id": client["id"],
            "avatar_url": user.get("avatar_url"),
            "two_fa_enabled": user["two_fa_enabled"],
        }
    }
