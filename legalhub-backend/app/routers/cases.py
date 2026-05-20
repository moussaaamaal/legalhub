import io
import logging
from datetime import datetime, timezone, date as _date
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from app.services.case_ingestion import ingest_case
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase, supabase_admin
from pydantic import BaseModel
from typing import Optional
from app.models.enums import CaseStatus, CasePriority, CaseType

_log = logging.getLogger(__name__)

def _notify_case_client(case_data: dict, title: str, message: str):
    try:
        client_id = case_data.get("client_id")
        if not client_id:
            return
        client = supabase.table("client").select("user_id").eq("id", client_id).maybe_single().execute()
        if not client.data or not client.data.get("user_id"):
            return
        supabase_admin.table("notification").insert({
            "user_id": client.data["user_id"],
            "type":    "CASE_UPDATE",
            "title":   title,
            "message": message,
        }).execute()
    except Exception as e:
        _log.warning(f"[case notification] skipped: {e}")

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
    estimated_value: Optional[float] = None
    filing_date: Optional[str] = None
    first_hearing_date: Optional[str] = None
    statute_of_limitations: Optional[str] = None
    progress_percent: Optional[int] = None

class UpdateCaseStatusRequest(BaseModel):
    status: CaseStatus

class AddTeamMemberRequest(BaseModel):
    user_id: str

STATUS_PROGRESS = {
    CaseStatus.NEW:           0,
    CaseStatus.INVESTIGATION: 20,
    CaseStatus.PRE_TRIAL:     40,
    CaseStatus.TRIAL:         60,
    CaseStatus.APPEAL:        80,
    CaseStatus.SETTLED:       100,
    CaseStatus.CLOSED:        100,
}

VALID_TRANSITIONS: dict[CaseStatus, list[CaseStatus]] = {
    CaseStatus.NEW:           [CaseStatus.INVESTIGATION, CaseStatus.CLOSED],
    CaseStatus.INVESTIGATION: [CaseStatus.PRE_TRIAL, CaseStatus.CLOSED],
    CaseStatus.PRE_TRIAL:     [CaseStatus.TRIAL, CaseStatus.CLOSED],
    CaseStatus.TRIAL:         [CaseStatus.APPEAL, CaseStatus.SETTLED, CaseStatus.CLOSED],
    CaseStatus.APPEAL:        [CaseStatus.SETTLED, CaseStatus.CLOSED],
    CaseStatus.SETTLED:       [],
    CaseStatus.CLOSED:        [],
}

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
        .select("*, client(id, first_name, last_name, email, phone, app_user(avatar_url))")
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
async def create_case(body: CreateCaseRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
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

    background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
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

# ─── GET /api/cases/:id/export ──────────────────────────

@router.get("/{case_id}/export")
async def export_case_pdf(case_id: str, current_user=Depends(get_lawyer)):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
    except ImportError:
        raise HTTPException(status_code=503, detail="reportlab not installed. Run: pip install reportlab")

    case_res = (
        supabase.table("case_file")
        .select("*, client(first_name, last_name, email, phone)")
        .eq("id", case_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not case_res.data:
        raise HTTPException(status_code=404, detail="Case not found")
    case = case_res.data

    timeline_res = (
        supabase.table("case_timeline")
        .select("action, created_at")
        .eq("case_id", case_id)
        .order("created_at", desc=False)
        .limit(20)
        .execute()
    )
    timeline = timeline_res.data or []

    docs_res = (
        supabase.table("document")
        .select("file_name, file_type, created_at")
        .eq("case_id", case_id)
        .execute()
    )
    documents = docs_res.data or []

    client = case.get("client") or {}
    client_name = f"{client.get('first_name','')} {client.get('last_name','')}".strip() or "—"

    firm_res  = supabase.table("firm").select("name").eq("id", current_user["firm_id"]).single().execute()
    firm_name = (firm_res.data or {}).get("name", "LegalHub")

    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    ss   = getSampleStyleSheet()
    elms = []

    elms.append(Paragraph(f"{firm_name}", ss["Title"]))
    elms.append(Paragraph("Case Summary Report", ss["Heading2"]))
    elms.append(HRFlowable(width="100%", color=colors.HexColor("#1E40AF")))
    elms.append(Spacer(1, 12))

    info_data = [
        ["Case Title",     case.get("title", "—")],
        ["Case Number",    case.get("case_number", "—")],
        ["Case Type",      case.get("case_type", "—")],
        ["Status",         case.get("status", "—")],
        ["Priority",       case.get("priority", "—")],
        ["Client",         client_name],
        ["Court",          case.get("court_name", "—")],
        ["Judge",          case.get("judge_name", "—")],
        ["Filing Date",    str(case.get("filing_date") or "—")],
        ["Estimated Value",f"${float(case.get('estimated_value') or 0):,.2f}"],
    ]
    tbl = Table(info_data, colWidths=[5*cm, 12*cm])
    tbl.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#EFF6FF"), colors.white]),
        ("GRID",      (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("VALIGN",    (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",(0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
    ]))
    elms.append(tbl)
    elms.append(Spacer(1, 12))

    if case.get("description"):
        elms.append(Paragraph("Description", ss["Heading3"]))
        elms.append(Paragraph(case["description"], ss["Normal"]))
        elms.append(Spacer(1, 8))

    if timeline:
        elms.append(Paragraph("Case Timeline", ss["Heading3"]))
        for entry in timeline:
            ts  = entry.get("created_at", "")[:10]
            act = entry.get("action", "")
            elms.append(Paragraph(f"• [{ts}] {act}", ss["Normal"]))
        elms.append(Spacer(1, 8))

    if documents:
        elms.append(Paragraph("Documents", ss["Heading3"]))
        doc_data = [["File Name", "Type", "Date"]] + [
            [d.get("file_name",""), d.get("file_type",""), str(d.get("created_at",""))[:10]]
            for d in documents
        ]
        dtbl = Table(doc_data, colWidths=[9*cm, 3*cm, 4*cm])
        dtbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E40AF")),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 8),
            ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
        ]))
        elms.append(dtbl)

    elms.append(Spacer(1, 20))
    elms.append(Paragraph(f"Generated: {_date.today()} by {current_user.get('full_name', current_user.get('email',''))}", ss["Normal"]))

    doc.build(elms)
    buf.seek(0)
    safe_title = case.get("case_number", case_id).replace("/", "-")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="case_{safe_title}.pdf"'},
    )


# ─── PUT /api/cases/:id ─────────────────────────────────

@router.put("/{case_id}")
async def update_case(case_id: str, body: UpdateCaseRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
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

    _notify_case_client(
        result.data[0],
        "Case Updated",
        f"Your case '{result.data[0].get('title', 'Unnamed')}' has been updated by your attorney.",
    )
    background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
    return result.data[0]

# ─── PATCH /api/cases/:id/status ────────────────────────

@router.patch("/{case_id}/status")
async def update_case_status(case_id: str, body: UpdateCaseStatusRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    current = (
        supabase.table("case_file")
        .select("status")
        .eq("id", case_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not current.data:
        raise HTTPException(status_code=404, detail="Case not found")

    current_status = CaseStatus(current.data["status"])
    allowed = VALID_TRANSITIONS.get(current_status, [])
    if body.status not in allowed:
        allowed_labels = [s.value for s in allowed] if allowed else ["none"]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {current_status.value} to {body.status.value}. "
                   f"Allowed: {', '.join(allowed_labels)}.",
        )

    result = supabase.table("case_file").update({
        "status": body.status,
        "progress_percent": STATUS_PROGRESS.get(body.status, 0),
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

    _notify_case_client(
        case_data,
        "Case Status Changed",
        f"Your case '{case_data.get('title', 'Unnamed')}' status is now: {body.status.value}.",
    )
    background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
    return case_data

# ─── PATCH /api/cases/:id/restore ──────────────────────
# Bypasses transition validation — for restoring archived/settled cases

@router.patch("/{case_id}/restore")
async def restore_case(case_id: str, current_user=Depends(get_lawyer)):
    result = supabase.table("case_file").update({
        "status": CaseStatus.INVESTIGATION,
        "progress_percent": STATUS_PROGRESS.get(CaseStatus.INVESTIGATION, 20),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).eq("firm_id", current_user["firm_id"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "firm_id": current_user["firm_id"],
        "action": "Case restored to Investigation",
        "performed_by": current_user["id"],
    }).execute()

    return result.data[0]

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
