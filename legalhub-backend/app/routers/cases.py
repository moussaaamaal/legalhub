from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase
from pydantic import BaseModel
from typing import Optional
from app.models.enums import CaseStatus, CasePriority, CaseType, BillingType

router = APIRouter(prefix="/api/cases", tags=["Cases"])

# ─── Schemas ────────────────────────────────────────────

class CreateCaseRequest(BaseModel):
    title: str
    case_number: str
    case_type: CaseType
    practice_area: Optional[str] = None
    priority: CasePriority = CasePriority.NORMAL
    description: Optional[str] = None
    client_id: Optional[str] = None
    opposing_party: Optional[str] = None
    opposing_counsel: Optional[str] = None
    court_name: Optional[str] = None
    court_location: Optional[str] = None
    judge_name: Optional[str] = None
    prosecutor_name: Optional[str] = None
    billing_type: Optional[BillingType] = None
    estimated_value: Optional[float] = None
    filing_date: Optional[str] = None
    first_hearing_date: Optional[str] = None
    statute_of_limitations: Optional[str] = None

class UpdateCaseRequest(BaseModel):
    title: Optional[str] = None
    case_type: Optional[CaseType] = None
    practice_area: Optional[str] = None
    priority: Optional[CasePriority] = None
    description: Optional[str] = None
    client_id: Optional[str] = None
    opposing_party: Optional[str] = None
    opposing_counsel: Optional[str] = None
    court_name: Optional[str] = None
    court_location: Optional[str] = None
    judge_name: Optional[str] = None
    prosecutor_name: Optional[str] = None
    billing_type: Optional[BillingType] = None
    estimated_value: Optional[float] = None
    filing_date: Optional[str] = None
    first_hearing_date: Optional[str] = None
    statute_of_limitations: Optional[str] = None
    progress_percent: Optional[int] = None

class UpdateCaseStatusRequest(BaseModel):
    status: CaseStatus

class AddTeamMemberRequest(BaseModel):
    user_id: str

# ─── GET /api/cases ─────────────────────────────────────

@router.get("")
async def list_cases(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    case_type: Optional[str] = None,
    current_user=Depends(get_lawyer)
):
    is_admin = current_user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

    query = (
        supabase.table("case_file")
        .select("*, client(id, first_name, last_name, email)")
        .eq("firm_id", current_user["firm_id"])
    )

    if not is_admin:
        team = supabase.table("case_team").select("case_id").eq("user_id", current_user["id"]).execute()
        case_ids = [r["case_id"] for r in (team.data or [])]
        if not case_ids:
            return []
        query = query.in_("id", case_ids)

    if status:
        query = query.eq("status", status)
    if priority:
        query = query.eq("priority", priority)
    if case_type:
        query = query.eq("case_type", case_type)

    result = query.order("created_at", desc=True).execute()
    return result.data

# ─── POST /api/cases ────────────────────────────────────

@router.post("", status_code=201)
async def create_case(body: CreateCaseRequest, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    data["firm_id"] = current_user["firm_id"]
    data["lawyer_id"] = current_user["id"]
    data["status"] = CaseStatus.NEW

    result = supabase.table("case_file").insert(data).execute()
    case_id = result.data[0]["id"]

    # Automatically add the assigned lawyer to the case team
    supabase.table("case_team").insert({
        "case_id": case_id,
        "user_id": current_user["id"],
        "firm_id": current_user["firm_id"],
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": "Case created",
        "performed_by": current_user["id"],
    }).execute()

    supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    "CASE_UPDATE",
        "title":   "New Case Created",
        "message": f"{body.title} ({body.case_number}) has been successfully created.",
    }).execute()

    return result.data[0]

# ─── GET /api/cases/client/:clientId ────────────────────
# Must be declared BEFORE /{case_id} to avoid route conflict

@router.get("/client/{client_id}")
async def get_cases_by_client(client_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("case_file")
        .select("*")
        .eq("client_id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data

# ─── GET /api/cases/:id ─────────────────────────────────

@router.get("/{case_id}")
async def get_case(case_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("case_file")
        .select("*, client(id, first_name, last_name, email, phone)")
        .eq("id", case_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")
    return result.data

# ─── PUT /api/cases/:id ─────────────────────────────────

@router.put("/{case_id}")
async def update_case(case_id: str, body: UpdateCaseRequest, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("case_file")
        .update(data)
        .eq("id", case_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": "Case details updated",
        "performed_by": current_user["id"],
    }).execute()

    return result.data[0]

# ─── PATCH /api/cases/:id/status ────────────────────────

@router.patch("/{case_id}/status")
async def update_case_status(case_id: str, body: UpdateCaseStatusRequest, current_user=Depends(get_lawyer)):
    result = supabase.table("case_file").update({
        "status": body.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).eq("firm_id", current_user["firm_id"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": f"Status changed to {body.status}",
        "performed_by": current_user["id"],
    }).execute()

    case_data = result.data[0]
    supabase.table("notification").insert({
        "user_id": case_data.get("lawyer_id") or current_user["id"],
        "type":    "CASE_UPDATE",
        "title":   "Case Status Updated",
        "message": f"'{case_data.get('title', 'A case')}' status changed to {body.status}.",
    }).execute()

    return case_data

# ─── DELETE /api/cases/:id (archive) ────────────────────

@router.delete("/{case_id}")
async def archive_case(case_id: str, current_user=Depends(get_lawyer)):
    supabase.table("case_file").update({
        "status": CaseStatus.CLOSED,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).eq("firm_id", current_user["firm_id"]).execute()

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": "Case archived",
        "performed_by": current_user["id"],
    }).execute()

    return {"message": "Case archived"}

# ─── GET /api/cases/:id/timeline ────────────────────────

@router.get("/{case_id}/timeline")
async def get_case_timeline(case_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("case_timeline")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data

# ─── GET /api/cases/:id/team ────────────────────────────

@router.get("/{case_id}/team")
async def get_case_team(case_id: str, current_user=Depends(get_lawyer)):
    result = (
        supabase.table("case_team")
        .select("*, app_user(id, full_name, email, role, avatar_url)")
        .eq("case_id", case_id)
        .execute()
    )
    return result.data

# ─── POST /api/cases/:id/team ───────────────────────────

@router.post("/{case_id}/team", status_code=201)
async def add_team_member(case_id: str, body: AddTeamMemberRequest, current_user=Depends(get_lawyer)):
    # Verify the user belongs to the same firm
    user_check = (
        supabase.table("app_user")
        .select("id")
        .eq("id", body.user_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not user_check.data:
        raise HTTPException(status_code=404, detail="User not found in this firm")

    result = supabase.table("case_team").insert({
        "case_id": case_id,
        "user_id": body.user_id,
        "firm_id": current_user["firm_id"],
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": "Team member added",
        "performed_by": current_user["id"],
    }).execute()

    supabase.table("notification").insert({
        "user_id": body.user_id,
        "type":    "TASK_ASSIGNED",
        "title":   "You've Been Added to a Case",
        "message": f"You were added to a case team by {current_user.get('full_name', 'a colleague')}.",
    }).execute()

    return result.data[0]

# ─── DELETE /api/cases/:id/team/:user_id ────────────────

@router.delete("/{case_id}/team/{user_id}")
async def remove_team_member(case_id: str, user_id: str, current_user=Depends(get_lawyer)):
    supabase.table("case_team").delete().eq("case_id", case_id).eq("user_id", user_id).execute()
    return {"message": "Team member removed"}
