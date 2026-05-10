from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase
from app.core.email import send_event_reminder_email
from app.core.config import settings
from pydantic import BaseModel, model_validator
from typing import Optional, List, Literal
from app.models.enums import EventType
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])

RecurrenceType = Literal["none", "weekly", "biweekly", "monthly"]

MAX_OCCURRENCES = 104   # hard ceiling (2 years of weekly events)


class CreateEventRequest(BaseModel):
    title: str
    event_type: EventType
    start_datetime: str
    end_datetime: Optional[str] = None
    case_id: Optional[str] = None
    location: Optional[str] = None
    is_video_call: bool = False
    video_call_url: Optional[str] = None
    reminder_minutes: Optional[List[int]] = None
    recurrence: RecurrenceType = "none"
    # Limit: provide ONE of these when recurrence != "none"
    recurrence_count: Optional[int] = None   # number of occurrences  (e.g. 10)
    recurrence_until: Optional[str] = None   # ISO date string         (e.g. "2026-12-31")

    @model_validator(mode="after")
    def check_recurrence_limit(self):
        if self.recurrence != "none":
            if self.recurrence_count is None and self.recurrence_until is None:
                raise ValueError(
                    "When recurrence is set you must provide either "
                    "'recurrence_count' (number of times) or 'recurrence_until' (end date)."
                )
            if self.recurrence_count is not None and self.recurrence_until is not None:
                raise ValueError(
                    "Provide only one of 'recurrence_count' or 'recurrence_until', not both."
                )
            if self.recurrence_count is not None:
                if self.recurrence_count < 1:
                    raise ValueError("'recurrence_count' must be at least 1.")
                if self.recurrence_count > MAX_OCCURRENCES:
                    raise ValueError(
                        f"'recurrence_count' cannot exceed {MAX_OCCURRENCES}."
                    )
        return self


def _generate_occurrences(
    start_iso: str,
    end_iso: Optional[str],
    recurrence: str,
    recurrence_count: Optional[int],
    recurrence_until: Optional[str],
) -> List[dict]:
    """
    Return [{start_datetime, end_datetime}, ...] for every occurrence.
    Stops at whichever limit comes first: count or until-date.
    """
    start    = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end      = datetime.fromisoformat(end_iso.replace("Z", "+00:00")) if end_iso else None
    duration = (end - start) if end else None

    until_dt = None
    if recurrence_until:
        until_dt = datetime.fromisoformat(recurrence_until.replace("Z", "+00:00"))
        if until_dt.tzinfo is None:
            until_dt = until_dt.replace(tzinfo=timezone.utc)

    def step(n: int):
        if recurrence == "weekly":
            return timedelta(weeks=n)
        if recurrence == "biweekly":
            return timedelta(weeks=2 * n)
        if recurrence == "monthly":
            return relativedelta(months=n)

    occurrences = []
    n = 0
    while True:
        occ_start = start + step(n)

        # Stop conditions
        if recurrence_count is not None and n >= recurrence_count:
            break
        if until_dt is not None and occ_start > until_dt:
            break
        if n >= MAX_OCCURRENCES:          # safety ceiling
            break

        occ_end = (occ_start + duration) if duration else None
        occurrences.append({
            "start_datetime": occ_start.isoformat(),
            "end_datetime":   occ_end.isoformat() if occ_end else None,
        })
        n += 1

    return occurrences


@router.get("/events")
async def list_events(
    event_type: Optional[str] = None,
    case_id: Optional[str] = None,
    from_date: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    is_admin = current_user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

    query = supabase.table("calendar_event").select("*").eq("firm_id", current_user["firm_id"])

    if not is_admin and current_user["role"] == "LAWYER":
        query = query.eq("created_by", current_user["id"])

    if event_type:
        query = query.eq("event_type", event_type)
    if case_id:
        query = query.eq("case_id", case_id)
    if from_date:
        query = query.gte("start_datetime", from_date)
    result = query.order("start_datetime").execute()
    return result.data


@router.post("/events", status_code=201)
async def create_event(body: CreateEventRequest, current_user=Depends(get_lawyer)):
    base_data = body.model_dump(exclude_none=True)
    # Remove recurrence meta-fields — not stored per row (except the label)
    for field in ("recurrence_count", "recurrence_until", "recurrence"):
        base_data.pop(field, None)
    base_data["firm_id"]    = current_user["firm_id"]
    base_data["created_by"] = current_user["id"]

    if body.recurrence == "none":
        result  = supabase.table("calendar_event").insert(base_data).execute()
        created = result.data
    else:
        occurrences = _generate_occurrences(
            body.start_datetime,
            body.end_datetime,
            body.recurrence,
            body.recurrence_count,
            body.recurrence_until,
        )
        rows = []
        for occ in occurrences:
            row = {**base_data, **occ}
            if occ["end_datetime"] is None:
                row.pop("end_datetime", None)
            rows.append(row)

        result  = supabase.table("calendar_event").insert(rows).execute()
        created = result.data

    if body.case_id:
        _EVENT_LABELS = {
            "HEARING": "Court Hearing", "COURT_DATE": "Court Date",
            "MEETING": "Meeting", "CONSULTATION": "Consultation",
            "DEADLINE": "Deadline", "FILING": "Filing",
            "DEPOSITION": "Deposition", "MEDIATION": "Mediation",
            "ARBITRATION": "Arbitration",
        }
        ev_type = _EVENT_LABELS.get(
            str(body.event_type).upper(),
            str(body.event_type).replace("_", " ").title(),
        )
        recurrence_note = f" (repeats {body.recurrence})" if body.recurrence != "none" else ""
        supabase.table("case_timeline").insert({
            "case_id":      body.case_id,
            "firm_id":      current_user["firm_id"],
            "action":       f"{ev_type} scheduled: {body.title}{recurrence_note}",
            "performed_by": current_user["id"],
        }).execute()

    return created[0]


@router.put("/events/{event_id}")
async def update_event(event_id: str, body: CreateEventRequest, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    for field in ("recurrence_count", "recurrence_until"):
        data.pop(field, None)
    result = (
        supabase.table("calendar_event")
        .update(data)
        .eq("id", event_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return result.data[0]


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, current_user=Depends(get_lawyer)):
    supabase.table("calendar_event").delete().eq("id", event_id).eq("firm_id", current_user["firm_id"]).execute()
    return {"message": "Event deleted"}


# ─── POST /api/calendar/test-reminder ──────────────────────────────────────
@router.post("/test-reminder")
async def test_reminder(current_user=Depends(get_current_user)):
    import logging
    log = logging.getLogger(__name__)

    email = current_user.get("email")
    name  = current_user.get("full_name", "Lawyer")
    if not email:
        raise HTTPException(status_code=400, detail="No email on your account")

    log.info(f"[test-reminder] sending to={email}, SENDGRID_KEY set={bool(settings.SENDGRID_API_KEY)}, FROM={settings.FROM_EMAIL}")

    if not settings.SENDGRID_API_KEY:
        raise HTTPException(status_code=500, detail="SENDGRID_API_KEY is not set in .env")

    now_display = datetime.now(timezone.utc).strftime("%A %d %B %Y at %H:%M")
    send_event_reminder_email(
        to_email=email,
        lawyer_name=name,
        event_title="Test Event — LegalHub Reminder",
        event_type="MEETING",
        start_datetime=now_display,
        minutes_before=30,
    )
    return {"message": f"Test reminder sent to {email}", "from": settings.FROM_EMAIL}
