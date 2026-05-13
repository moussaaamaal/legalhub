import secrets
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase
from app.core.email import send_client_invite_email
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.enums import ClientTag

router = APIRouter(prefix="/api/clients", tags=["Clients"])

# ─── Schemas ────────────────────────────────────────────

class CreateClientRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    national_id: Optional[str] = None
    nationality: Optional[str] = None
    occupation: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    client_type: str = "INDIVIDUAL"
    tag: ClientTag = ClientTag.ACTIVE
    notes: Optional[str] = None

class UpdateClientRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    national_id: Optional[str] = None
    nationality: Optional[str] = None
    occupation: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    client_type: Optional[str] = None
    tag: Optional[ClientTag] = None
    notes: Optional[str] = None

# ─── GET /api/clients ───────────────────────────────────

@router.get("")
async def list_clients(
    tag: Optional[str] = None,
    search: Optional[str] = None,
    current_user=Depends(get_lawyer)
):
    is_admin = current_user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

    query = (
        supabase.table("client")
        .select("*")
        .eq("firm_id", current_user["firm_id"])
    )

    if not is_admin:
        # Clients linked to cases where this lawyer is a team member
        team = supabase.table("case_team").select("case_id").eq("user_id", current_user["id"]).execute()
        lawyer_case_ids = [r["case_id"] for r in (team.data or [])]

        if not lawyer_case_ids:
            return []

        cases_res = (
            supabase.table("case_file")
            .select("client_id")
            .in_("id", lawyer_case_ids)
            .not_.is_("client_id", "null")
            .execute()
        )
        client_ids = list({r["client_id"] for r in (cases_res.data or []) if r.get("client_id")})

        if not client_ids:
            return []

        query = query.in_("id", client_ids)

    if tag:
        query = query.eq("tag", tag)
    result = query.order("created_at", desc=True).execute()

    data = result.data or []
    if search:
        s = search.lower()
        data = [
            c for c in data
            if s in (c.get("first_name") or "").lower()
            or s in (c.get("last_name") or "").lower()
            or s in (c.get("email") or "").lower()
        ]

    # Enrich with stats and avatar
    if data:
        client_ids = [c["id"] for c in data]

        cases_res = (
            supabase.table("case_file")
            .select("client_id, status, case_type")
            .in_("client_id", client_ids)
            .eq("firm_id", current_user["firm_id"])
            .execute()
        )
        cases_by_client: dict = {}
        for case in (cases_res.data or []):
            cid = case.get("client_id")
            if cid:
                cases_by_client.setdefault(cid, []).append(case)

        invoices_res = (
            supabase.table("invoice")
            .select("client_id, total_amount, status")
            .in_("client_id", client_ids)
            .eq("firm_id", current_user["firm_id"])
            .execute()
        )
        billed_by_client: dict = {}
        unpaid_by_client: dict = {}
        for inv in (invoices_res.data or []):
            cid = inv.get("client_id")
            if cid:
                billed_by_client[cid] = billed_by_client.get(cid, 0) + float(inv.get("total_amount") or 0)
                if inv.get("status") in ("PENDING", "OVERDUE"):
                    unpaid_by_client[cid] = True

        user_ids = [c["user_id"] for c in data if c.get("user_id")]
        avatar_map: dict = {}
        if user_ids:
            users_res = (
                supabase.table("app_user")
                .select("id, avatar_url")
                .in_("id", user_ids)
                .execute()
            )
            avatar_map = {u["id"]: u.get("avatar_url") for u in (users_res.data or [])}

        active_statuses = {"NEW", "INVESTIGATION", "PRE_TRIAL", "TRIAL", "APPEAL"}
        for c in data:
            cid = c["id"]
            client_cases = cases_by_client.get(cid, [])
            types = [x.get("case_type") for x in client_cases if x.get("case_type")]
            c["active_cases_count"]   = sum(1 for x in client_cases if x.get("status") in active_statuses)
            c["total_billed"]         = round(billed_by_client.get(cid, 0), 2)
            c["has_unpaid_invoices"]  = unpaid_by_client.get(cid, False)
            c["practice_area"]        = max(set(types), key=types.count) if types else None
            c["avatar_url"]           = avatar_map.get(c.get("user_id"))

    return data

# ─── POST /api/clients ──────────────────────────────────

@router.post("", status_code=201)
async def create_client(body: CreateClientRequest, current_user=Depends(get_lawyer)):
    # Resolve lawyer profile id
    lawyer_result = (
        supabase.table("lawyer")
        .select("id")
        .eq("user_id", current_user["id"])
        .execute()
    )
    lawyer_id = lawyer_result.data[0]["id"] if lawyer_result.data else current_user["id"]

    data = body.model_dump(exclude_none=True)
    data["firm_id"] = current_user["firm_id"]
    data["assigned_lawyer_id"] = lawyer_id
    data["invite_status"] = "PENDING"

    result = supabase.table("client").insert(data).execute()
    return result.data[0]

# ─── GET /api/clients/:id ───────────────────────────────

@router.get("/{client_id}")
async def get_client(client_id: str, current_user=Depends(get_lawyer)):
    result = (
        supabase.table("client")
        .select("*")
        .eq("id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    client = result.data
    if client.get("user_id"):
        user_res = supabase.table("app_user").select("avatar_url").eq("id", client["user_id"]).single().execute()
        client["avatar_url"] = user_res.data.get("avatar_url") if user_res.data else None
    return client

# ─── PUT /api/clients/:id ───────────────────────────────

@router.put("/{client_id}")
async def update_client(client_id: str, body: UpdateClientRequest, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("client")
        .update(data)
        .eq("id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    return result.data[0]

# ─── DELETE /api/clients/:id ────────────────────────────

@router.delete("/{client_id}")
async def deactivate_client(client_id: str, current_user=Depends(get_lawyer)):
    supabase.table("client").update({"tag": "PENDING"}).eq("id", client_id).eq("firm_id", current_user["firm_id"]).execute()
    return {"message": "Client deactivated"}

# ─── POST /api/clients/:id/invite ───────────────────────

@router.post("/{client_id}/invite")
async def invite_client(client_id: str, current_user=Depends(get_lawyer)):
    client = (
        supabase.table("client")
        .select("id, email, first_name, invite_status")
        .eq("id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not client.data:
        raise HTTPException(status_code=404, detail="Client not found")

    invite_token = secrets.token_urlsafe(32)
    supabase.table("client").update({
        "invite_token": invite_token,
        "invite_status": "PENDING",
    }).eq("id", client_id).execute()

    # Fetch firm name for the email
    firm_result = supabase.table("firm").select("name").eq("id", current_user["firm_id"]).single().execute()
    firm_name = firm_result.data["name"] if firm_result.data else "Your Law Firm"

    send_client_invite_email(
        to_email=client.data["email"],
        client_name=client.data["first_name"],
        firm_name=firm_name,
        invite_token=invite_token,
    )

    return {"message": f"Invitation sent to {client.data['email']}", "invite_token": invite_token}

# ─── GET /api/clients/:id/cases ─────────────────────────

@router.get("/{client_id}/cases")
async def get_client_cases(client_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("case_file")
        .select("*")
        .eq("client_id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data

# ─── GET /api/clients/:id/invoices ──────────────────────

@router.get("/{client_id}/invoices")
async def get_client_invoices(client_id: str, current_user=Depends(get_lawyer)):
    result = (
        supabase.table("invoice")
        .select("*, invoice_item(*)")
        .eq("client_id", client_id)
        .eq("firm_id", current_user["firm_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
