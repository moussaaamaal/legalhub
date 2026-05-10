from datetime import date
from fastapi import APIRouter, Depends
from app.core.dependencies import get_lawyer
from app.core.database import supabase

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _is_admin(user) -> bool:
    return user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")


def _get_lawyer_case_ids(user_id: str) -> list:
    """Return case IDs where the lawyer is a team member (includes cases they created)."""
    result = supabase.table("case_team").select("case_id").eq("user_id", user_id).execute()
    return [r["case_id"] for r in (result.data or [])]


# ─── GET /api/dashboard/stats ───────────────────────────

@router.get("/stats")
async def get_dashboard_stats(current_user=Depends(get_lawyer)):
    firm_id = current_user["firm_id"]
    user_id = current_user["id"]
    today   = date.today().isoformat()
    admin   = _is_admin(current_user)

    # Cases
    if admin:
        case_data = (
            supabase.table("case_file").select("id, status").eq("firm_id", firm_id).execute()
        ).data or []
    else:
        case_ids = _get_lawyer_case_ids(user_id)
        case_data = (
            supabase.table("case_file").select("id, status").in_("id", case_ids).execute()
        ).data or [] if case_ids else []

    active_cases = len([c for c in case_data if c["status"] not in ("SETTLED", "CLOSED")])
    closed_cases = len([c for c in case_data if c["status"] in ("SETTLED", "CLOSED")])

    # Upcoming hearings
    hearings_q = (
        supabase.table("calendar_event")
        .select("id")
        .eq("firm_id", firm_id)
        .eq("event_type", "HEARING")
        .gte("start_datetime", today)
    )
    if not admin:
        hearings_q = hearings_q.eq("created_by", user_id)
    upcoming_hearings = len((hearings_q.execute()).data or [])

    # Pending invoices (firm-wide)
    invoices = (
        supabase.table("invoice")
        .select("id, status, total_amount")
        .eq("firm_id", firm_id)
        .in_("status", ["PENDING", "OVERDUE"])
        .execute()
    )
    pending_payments = sum(i["total_amount"] for i in (invoices.data or []))

    # Active reminders
    base_task_q = lambda: (
        supabase.table("task")
        .select("id")
        .eq("firm_id", firm_id)
        .in_("status", ["PENDING", "IN_PROGRESS"])
        .lte("due_date", today)
    )
    if admin:
        active_reminders = len((base_task_q().execute()).data or [])
    else:
        assigned_ids = {t["id"] for t in (base_task_q().eq("assigned_to", user_id).execute()).data or []}
        created_ids  = {t["id"] for t in (base_task_q().eq("created_by",  user_id).execute()).data or []}
        active_reminders = len(assigned_ids | created_ids)

    return {
        "active_cases":      active_cases,
        "closed_cases":      closed_cases,
        "upcoming_hearings": upcoming_hearings,
        "pending_payments":  round(pending_payments, 2),
        "active_reminders":  active_reminders,
    }

# ─── GET /api/dashboard/today ───────────────────────────

@router.get("/today")
async def get_today_schedule(current_user=Depends(get_lawyer)):
    """Today's events ordered by time."""
    today_start = f"{date.today().isoformat()}T00:00:00"
    today_end   = f"{date.today().isoformat()}T23:59:59"

    query = (
        supabase.table("calendar_event")
        .select("*, case_file(id, title, case_number)")
        .eq("firm_id", current_user["firm_id"])
        .gte("start_datetime", today_start)
        .lte("start_datetime", today_end)
        .order("start_datetime")
    )
    if not _is_admin(current_user):
        query = query.eq("created_by", current_user["id"])

    return query.execute().data or []

# ─── GET /api/dashboard/recent-activity ─────────────────

_EVENT_TYPE_LABELS = {
    "HEARING":      "Court Hearing",
    "COURT_DATE":   "Court Date",
    "MEETING":      "Meeting",
    "CONSULTATION": "Consultation",
    "DEADLINE":     "Deadline",
    "FILING":       "Filing",
    "DEPOSITION":   "Deposition",
    "MEDIATION":    "Mediation",
    "ARBITRATION":  "Arbitration",
}

@router.get("/recent-activity")
async def get_recent_activity(
    current_user=Depends(get_lawyer),
    days: int = 3,
):
    """
    Activity entries for the last `days` days (default 3, use 7 for full-week view).
    Merges case timeline events + calendar events, sorted by date descending.
    """
    from datetime import datetime, timezone, timedelta

    firm_id = current_user["firm_id"]
    user_id = current_user["id"]
    admin   = _is_admin(current_user)
    since   = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    limit   = 200 if days > 3 else 10

    # ── Case timeline entries ──────────────────────────────────────────────
    timeline_q = (
        supabase.table("case_timeline")
        .select("*, case_file(id, title, case_number)")
        .eq("firm_id", firm_id)
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if not admin:
        case_ids = _get_lawyer_case_ids(user_id)
        timeline = (timeline_q.in_("case_id", case_ids).execute()).data or [] if case_ids else []
    else:
        timeline = (timeline_q.execute()).data or []

    # ── Calendar events WITHOUT a case_id only ────────────────────────────
    cal_q = (
        supabase.table("calendar_event")
        .select("id, title, event_type, created_at")
        .eq("firm_id", firm_id)
        .is_("case_id", "null")
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if not admin:
        cal_q = cal_q.eq("created_by", user_id)
    cal_result = (cal_q.execute()).data or []

    formatted_events = []
    for ev in cal_result:
        ev_type = _EVENT_TYPE_LABELS.get(
            (ev.get("event_type") or "").upper(),
            (ev.get("event_type") or "Event").replace("_", " ").title(),
        )
        formatted_events.append({
            "id":         f"evt_{ev['id']}",
            "action":     f"{ev_type} scheduled: {ev['title']}",
            "created_at": ev.get("created_at"),
            "case_file":  None,
        })

    # ── Merge and sort ─────────────────────────────────────────────────────
    all_activity = timeline + formatted_events
    all_activity.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return all_activity


# ─── GET /api/dashboard/recent-cases ────────────────────

@router.get("/recent-cases")
async def get_recent_cases(current_user=Depends(get_lawyer)):
    """5 most recently updated active cases — used for quick preview strip."""
    query = (
        supabase.table("case_file")
        .select("id, case_number, title, status, priority, updated_at, client(first_name, last_name)")
        .eq("firm_id", current_user["firm_id"])
        .not_.in_("status", ["SETTLED", "CLOSED"])
        .order("updated_at", desc=True)
        .limit(5)
    )
    if not _is_admin(current_user):
        case_ids = _get_lawyer_case_ids(current_user["id"])
        if not case_ids:
            return []
        query = query.in_("id", case_ids)

    cases = query.execute().data or []
    for case in cases:
        client = case.pop("client", None)
        case["client_name"] = (
            f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()
            if client else None
        )
    return cases
