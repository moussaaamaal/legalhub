from datetime import date
from fastapi import APIRouter, Depends
from app.core.dependencies import get_lawyer
from app.core.database import supabase

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# ─── GET /api/dashboard/stats ───────────────────────────

@router.get("/stats")
async def get_dashboard_stats(current_user=Depends(get_lawyer)):
    """
    Home dashboard KPIs:
    - Active Cases, Closed Cases, Upcoming Hearings,
      Pending Payments, Active Reminders (tasks due today).
    """
    firm_id = current_user["firm_id"]
    today   = date.today().isoformat()

    cases = supabase.table("case_file").select("id, status").eq("firm_id", firm_id).execute()
    case_data = cases.data or []

    active_cases = len([c for c in case_data if c["status"] not in ("SETTLED", "CLOSED")])
    closed_cases = len([c for c in case_data if c["status"] in ("SETTLED", "CLOSED")])

    # Upcoming hearings (next 30 days)
    hearings = (
        supabase.table("calendar_event")
        .select("id")
        .eq("firm_id", firm_id)
        .eq("event_type", "HEARING")
        .gte("start_datetime", today)
        .execute()
    )
    upcoming_hearings = len(hearings.data or [])

    # Pending invoices (PENDING + OVERDUE)
    invoices = (
        supabase.table("invoice")
        .select("id, status, total_amount")
        .eq("firm_id", firm_id)
        .in_("status", ["PENDING", "OVERDUE"])
        .execute()
    )
    pending_payments = sum(i["total_amount"] for i in (invoices.data or []))

    # Active reminders = tasks pending/in-progress due today or earlier
    tasks = (
        supabase.table("task")
        .select("id")
        .eq("firm_id", firm_id)
        .in_("status", ["PENDING", "IN_PROGRESS"])
        .lte("due_date", today)
        .execute()
    )
    active_reminders = len(tasks.data or [])

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
    """Today's events ordered by time — used for the mobile home dashboard."""
    today_start = f"{date.today().isoformat()}T00:00:00"
    today_end   = f"{date.today().isoformat()}T23:59:59"

    result = (
        supabase.table("calendar_event")
        .select("*, case_file(id, title, case_number)")
        .eq("firm_id", current_user["firm_id"])
        .gte("start_datetime", today_start)
        .lte("start_datetime", today_end)
        .order("start_datetime")
        .execute()
    )
    return result.data or []

# ─── GET /api/dashboard/recent-cases ────────────────────

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

    firm_id  = current_user["firm_id"]
    since    = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    limit    = 200 if days > 3 else 10

    # ── Case timeline entries ──────────────────────────────────────────────
    timeline = (
        supabase.table("case_timeline")
        .select("*, case_file(id, title, case_number)")
        .eq("firm_id", firm_id)
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []

    # ── Calendar events WITHOUT a case_id only ────────────────────────────
    cal_result = (
        supabase.table("calendar_event")
        .select("id, title, event_type, created_at")
        .eq("firm_id", firm_id)
        .is_("case_id", "null")
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []

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


@router.get("/recent-cases")
async def get_recent_cases(current_user=Depends(get_lawyer)):
    """5 most recently updated active cases — used for quick preview strip."""
    result = (
        supabase.table("case_file")
        .select("id, case_number, title, status, priority, updated_at, client(first_name, last_name)")
        .eq("firm_id", current_user["firm_id"])
        .not_.in_("status", ["SETTLED", "CLOSED"])
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    )
    cases = result.data or []
    # Flatten client name into a single client_name field
    for case in cases:
        client = case.pop("client", None)
        if client:
            case["client_name"] = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()
        else:
            case["client_name"] = None
    return cases
