import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.dependencies import get_firm_admin, get_current_user, get_lawyer
from app.core.database import supabase, supabase_admin
from pydantic import BaseModel, EmailStr
from typing import Optional, List

router = APIRouter(prefix="/api/firm", tags=["Firm & Settings"])

# ─── Schemas ────────────────────────────────────────────

class UpdateFirmProfileRequest(BaseModel):
    name: Optional[str] = None
    legal_entity_type: Optional[str] = None
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    practice_areas: Optional[List[str]] = None
    description: Optional[str] = None

class UpdateBrandingRequest(BaseModel):
    logo_url: Optional[str] = None
    display_name: Optional[str] = None

class UpdateTeamRoleRequest(BaseModel):
    role: str  # LAWYER | FIRM_ADMIN

# ─── GET /api/firm/profile ──────────────────────────────

@router.get("/profile")
async def get_firm_profile(current_user=Depends(get_lawyer)):
    result = (
        supabase.table("firm")
        .select("*")
        .eq("id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    return result.data

# ─── PUT /api/firm/profile ──────────────────────────────

@router.put("/profile")
async def update_firm_profile(body: UpdateFirmProfileRequest, current_user=Depends(get_firm_admin)):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("firm")
        .update(data)
        .eq("id", current_user["firm_id"])
        .execute()
    )
    return result.data[0]

# ─── GET /api/firm/team ─────────────────────────────────

@router.get("/team")
async def list_team(current_user=Depends(get_lawyer)):
    result = (
        supabase.table("app_user")
        .select("id, full_name, email, role, phone, avatar_url, is_active, last_login_at, created_at, lawyer(title, bar_license_number, bar_license_state, specializations, years_experience, office_location)")
        .eq("firm_id", current_user["firm_id"])
        .neq("role", "CLIENT")
        .order("created_at")
        .execute()
    )
    return result.data

# ─── PUT /api/firm/team/:userId/role ────────────────────

@router.put("/team/{user_id}/role")
async def update_team_member_role(user_id: str, body: UpdateTeamRoleRequest, current_user=Depends(get_firm_admin)):
    allowed_roles = ("LAWYER", "FIRM_ADMIN")
    if body.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of {allowed_roles}")

    result = (
        supabase.table("app_user")
        .update({"role": body.role})
        .eq("id", user_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Team member not found")
    return {"message": "Role updated", "user_id": user_id, "role": body.role}

# ─── DELETE /api/firm/team/:userId ──────────────────────

@router.delete("/team/{user_id}")
async def deactivate_team_member(user_id: str, current_user=Depends(get_firm_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    result = (
        supabase.table("app_user")
        .update({"is_active": False})
        .eq("id", user_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Team member not found")
    return {"message": "Team member deactivated"}

# ─── GET /api/firm/branding ─────────────────────────────

@router.get("/branding")
async def get_branding(current_user=Depends(get_lawyer)):
    result = (
        supabase.table("firm_branding")
        .select("*")
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    # Return empty config if not set yet
    return result.data[0] if result.data else {}

# ─── PUT /api/firm/branding ─────────────────────────────

@router.put("/branding")
async def update_branding(body: UpdateBrandingRequest, current_user=Depends(get_firm_admin)):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = (
        supabase.table("firm_branding")
        .select("id")
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )

    if existing.data:
        result = (
            supabase.table("firm_branding")
            .update(data)
            .eq("firm_id", current_user["firm_id"])
            .execute()
        )
    else:
        data["firm_id"] = current_user["firm_id"]
        result = supabase.table("firm_branding").insert(data).execute()

    return result.data[0]

# ─── GET /api/firm/office-code ──────────────────────────

@router.get("/office-code")
async def get_office_code(current_user=Depends(get_firm_admin)):
    result = (
        supabase.table("firm")
        .select("office_code")
        .eq("id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    return {"office_code": result.data["office_code"]}

# ─── GET /api/firm/stats ────────────────────────────────

@router.get("/stats")
async def get_firm_stats(current_user=Depends(get_firm_admin)):
    firm_id = current_user["firm_id"]

    cases = (
        supabase.table("case_file").select("id, status").eq("firm_id", firm_id).execute()
    ).data or []
    active_cases = len([c for c in cases if c["status"] not in ("SETTLED", "CLOSED")])
    closed_cases = len([c for c in cases if c["status"] in ("SETTLED", "CLOSED")])

    members = (
        supabase.table("app_user")
        .select("id")
        .eq("firm_id", firm_id)
        .neq("role", "CLIENT")
        .eq("is_active", True)
        .execute()
    ).data or []

    clients = (
        supabase.table("app_user")
        .select("id")
        .eq("firm_id", firm_id)
        .eq("role", "CLIENT")
        .execute()
    ).data or []

    documents = (
        supabase.table("document").select("id").eq("firm_id", firm_id).execute()
    ).data or []

    return {
        "active_cases":    active_cases,
        "closed_cases":    closed_cases,
        "total_members":   len(members),
        "total_clients":   len(clients),
        "total_documents": len(documents),
    }

# ─── POST /api/firm/branding/logo ───────────────────────

@router.post("/branding/logo")
async def upload_firm_logo(file: UploadFile = File(...), current_user=Depends(get_firm_admin)):
    firm_id = current_user["firm_id"]
    content = await file.read()
    content_type = file.content_type or "image/jpeg"
    ext = (file.filename or "logo.jpg").rsplit(".", 1)[-1]
    storage_path = f"logos/{firm_id}/{uuid.uuid4()}.{ext}"

    try:
        supabase_admin.storage.create_bucket("firm-assets", options={"public": True})
    except Exception:
        pass

    supabase_admin.storage.from_("firm-assets").upload(
        storage_path, content, file_options={"content-type": content_type}
    )
    logo_url = supabase_admin.storage.from_("firm-assets").get_public_url(storage_path)

    # Persist to branding table
    existing = (
        supabase.table("firm_branding").select("id").eq("firm_id", firm_id).execute()
    )
    if existing.data:
        supabase.table("firm_branding").update({"logo_url": logo_url}).eq("firm_id", firm_id).execute()
    else:
        supabase.table("firm_branding").insert({"firm_id": firm_id, "logo_url": logo_url}).execute()

    return {"logo_url": logo_url}
