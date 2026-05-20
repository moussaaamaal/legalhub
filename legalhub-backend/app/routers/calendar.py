import json
import base64
import logging
import requests as _req
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import RedirectResponse
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase, supabase_admin
from app.core.email import send_event_reminder_email
from app.core.config import settings
from pydantic import BaseModel, model_validator
from typing import Optional, List, Literal
from app.models.enums import EventType
from app.services.case_ingestion import ingest_case, ingest_standalone_events
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])

RecurrenceType = Literal["none", "weekly", "biweekly", "monthly"]

MAX_OCCURRENCES = 104   # hard ceiling (2 years of weekly events)

_EVENT_LABELS = {
    "HEARING": "Court Hearing", "COURT_DATE": "Court Date",
    "MEETING": "Meeting", "CONSULTATION": "Consultation",
    "DEADLINE": "Deadline", "FILING": "Filing",
    "DEPOSITION": "Deposition", "MEDIATION": "Mediation",
    "ARBITRATION": "Arbitration",
}

def _ev_label(event_type) -> str:
    raw = event_type.value if hasattr(event_type, "value") else str(event_type).split(".")[-1]
    return _EVENT_LABELS.get(raw.upper(), raw.replace("_", " ").title())

def _fmt_event_dt(dt_str: str) -> str:
    """Return a human-readable date+time string from an event datetime."""
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return dt.strftime("%A %d %B at %H:%M")
    except Exception:
        return dt_str


_NOTIF_TYPE_MAP = {
    "MEETING":    "MEETING_REQUEST",
    "DEADLINE":   "TASK_ASSIGNED",
    "COURT_DATE": "HEARING_REMINDER",
    "HEARING":    "HEARING_REMINDER",
}


def _notify_participants(event_id: str, title: str, label: str, start: str,
                         participant_ids: list[str], exclude_user_id: str,
                         action: str = "New", event_type: str = "") -> None:
    """Send a notification to each participant (excluding the actor)."""
    date_display = _fmt_event_dt(start)
    raw = str(getattr(event_type, "value", event_type)).upper().split(".")[-1]
    notif_type = _NOTIF_TYPE_MAP.get(raw, "GENERAL")

    notif_title = f"You've been added to: {title}" if action == "New" else f"Event updated: {title}"

    msg = json.dumps({
        "event_id":       event_id,
        "event_title":    title,
        "event_type":     label,
        "start_datetime": start,
        "date_display":   date_display,
        "action":         action,
    })
    for uid in participant_ids:
        if uid == exclude_user_id:
            continue
        try:
            supabase_admin.table("notification").insert({
                "user_id": uid, "type": notif_type,
                "title": notif_title, "message": msg,
            }).execute()
        except Exception as e:
            _log.warning(f"[notify_participants] skipped uid={uid}: {e}")


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
    participant_ids: Optional[List[str]] = None  # user IDs to invite

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


def _enrich_events(events: list, exclude_user_id: str | None = None) -> list:
    """Attach case_title and participants list to each event."""
    if not events:
        return events

    event_ids = [ev["id"] for ev in events]
    case_ids  = list({ev["case_id"] for ev in events if ev.get("case_id")})

    # Case info
    case_map: dict = {}
    if case_ids:
        res = supabase.table("case_file").select("id, title, case_number").in_("id", case_ids).execute()
        case_map = {c["id"]: c for c in (res.data or [])}

    # Participants per event
    parts_res = (
        supabase.table("calendar_event_participant")
        .select("event_id, user_id, participant_type")
        .in_("event_id", event_ids)
        .execute()
    )
    parts_by_event: dict = {}
    all_user_ids: set = set()
    for p in (parts_res.data or []):
        parts_by_event.setdefault(p["event_id"], []).append(p)
        all_user_ids.add(p["user_id"])

    # User names
    user_map: dict = {}
    if all_user_ids:
        users_res = (
            supabase.table("app_user")
            .select("id, full_name")
            .in_("id", list(all_user_ids))
            .execute()
        )
        user_map = {u["id"]: u.get("full_name") or "" for u in (users_res.data or [])}

    for ev in events:
        case = case_map.get(ev.get("case_id") or "")
        ev["case_title"] = case.get("title", "") if case else None
        ev["participants"] = [
            {
                "user_id":          p["user_id"],
                "full_name":        user_map.get(p["user_id"], ""),
                "participant_type": p["participant_type"],
            }
            for p in parts_by_event.get(ev["id"], [])
            if p["user_id"] != exclude_user_id
        ]

    return events


@router.get("/events")
async def list_events(
    event_type: Optional[str] = None,
    case_id: Optional[str] = None,
    from_date: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    firm_id  = current_user["firm_id"]
    is_admin = current_user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

    if not is_admin and current_user["role"] == "LAWYER":
        user_id = current_user["id"]

        def _apply_filters(q):
            if event_type:
                q = q.eq("event_type", event_type)
            if case_id:
                q = q.eq("case_id", case_id)
            if from_date:
                q = q.gte("start_datetime", from_date)
            return q

        # All case IDs where user is a team member
        team = supabase.table("case_team").select("case_id").eq("user_id", user_id).execute()
        lawyer_case_ids = [r["case_id"] for r in (team.data or [])]

        # All event IDs where user is explicitly a participant
        part_res = (
            supabase.table("calendar_event_participant")
            .select("event_id")
            .eq("user_id", user_id)
            .execute()
        )
        participated_ids_set = {r["event_id"] for r in (part_res.data or [])}

        # 1. Events created by the user
        q_created = _apply_filters(
            supabase.table("calendar_event").select("*").eq("firm_id", firm_id).eq("created_by", user_id)
        )
        events_created = (q_created.execute()).data or []

        # 2. All events on user's cases (created by others) — regardless of participant status
        events_cases = []
        if lawyer_case_ids:
            q_case = _apply_filters(
                supabase.table("calendar_event").select("*")
                .eq("firm_id", firm_id)
                .in_("case_id", lawyer_case_ids)
                .neq("created_by", user_id)
            )
            events_cases = (q_case.execute()).data or []

        # 3. Events where user is participant but outside their cases (e.g. different case)
        events_extra = []
        if participated_ids_set:
            already_seen = {ev["id"] for ev in events_created + events_cases}
            extra_ids = [eid for eid in participated_ids_set if eid not in already_seen]
            if extra_ids:
                q_extra = _apply_filters(
                    supabase.table("calendar_event").select("*")
                    .eq("firm_id", firm_id)
                    .in_("id", extra_ids)
                )
                events_extra = (q_extra.execute()).data or []

        # Merge, deduplicate, sort
        # Badge "Participant" = user created the event OR is explicitly a participant
        seen: set = set()
        merged = []
        for ev in events_created + events_cases + events_extra:
            if ev["id"] not in seen:
                seen.add(ev["id"])
                ev["is_participant"] = ev["id"] in participated_ids_set
                merged.append(ev)

        merged.sort(key=lambda x: x.get("start_datetime") or "")
        return _enrich_events(merged, exclude_user_id=user_id)

    query = supabase.table("calendar_event").select("*").eq("firm_id", firm_id)
    if event_type:
        query = query.eq("event_type", event_type)
    if case_id:
        query = query.eq("case_id", case_id)
    if from_date:
        query = query.gte("start_datetime", from_date)
    events = (query.order("start_datetime").execute()).data or []
    return _enrich_events(events, exclude_user_id=current_user["id"])


@router.post("/events", status_code=201)
async def create_event(body: CreateEventRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    base_data = body.model_dump(exclude_none=True)
    # Remove recurrence meta-fields and participant_ids — not stored in calendar_event row
    for field in ("recurrence_count", "recurrence_until", "recurrence", "participant_ids"):
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

    # Insert participants for all created occurrences
    # Always include the creator + any explicitly chosen participants (deduplicated)
    all_participant_ids = list({current_user["id"], *(body.participant_ids or [])})
    if created:
        participant_rows = [
            {"event_id": ev["id"], "user_id": uid, "participant_type": "TEAM_MEMBER"}
            for ev in created
            for uid in all_participant_ids
        ]
        try:
            supabase.table("calendar_event_participant").insert(participant_rows).execute()
        except Exception as e:
            _log.warning(f"[create_event] participant insert skipped: {e}")

    # Notify participants (excluding creator)
    ev_label = _ev_label(body.event_type)
    if created and len(all_participant_ids) > 1:
        _notify_participants(
            event_id=created[0]["id"],
            title=body.title,
            label=ev_label,
            start=body.start_datetime,
            participant_ids=all_participant_ids,
            exclude_user_id=current_user["id"],
            action="New",
            event_type=body.event_type,
        )

    if body.case_id:
        recurrence_note = f" (repeats {body.recurrence})" if body.recurrence != "none" else ""
        supabase.table("case_timeline").insert({
            "case_id":      body.case_id,
            "firm_id":      current_user["firm_id"],
            "action":       f"{ev_label} scheduled: {body.title}{recurrence_note}",
            "performed_by": current_user["id"],
        }).execute()

        # Notify the client linked to this case
        try:
            case_res = (
                supabase.table("case_file")
                .select("client_id, title")
                .eq("id", body.case_id)
                .maybe_single()
                .execute()
            )
            if not case_res or not case_res.data:
                raise ValueError("case not found")

            client_id  = case_res.data.get("client_id")
            case_title = case_res.data.get("title", "")

            if not client_id:
                raise ValueError("case has no client")

            client_res = (
                supabase.table("client")
                .select("user_id")
                .eq("id", client_id)
                .maybe_single()
                .execute()
            )
            if not client_res or not client_res.data:
                raise ValueError("client record not found")

            client_user_id = client_res.data.get("user_id")
            if not client_user_id:
                raise ValueError("client has no account yet")

            event_id = created[0]["id"] if created else None
            msg_data = {
                "event_id":      event_id,
                "event_title":   body.title,
                "event_type":    ev_label,
                "start_datetime": body.start_datetime,
            }
            if case_title:
                msg_data["case_title"] = case_title
            if body.is_video_call:
                msg_data["is_video_call"] = True
                if body.video_call_url:
                    msg_data["video_call_url"] = body.video_call_url
            elif body.location:
                msg_data["location"] = body.location
            if body.recurrence != "none":
                msg_data["recurrence"] = body.recurrence

            supabase_admin.table("notification").insert({
                "user_id": client_user_id,
                "type":    "GENERAL",
                "title":   f"New {ev_label}: {body.title}",
                "message": json.dumps({**msg_data, "date_display": _fmt_event_dt(body.start_datetime), "action": "New"}),
            }).execute()

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[create_event] client notification skipped: {e}")

    firm_id = current_user["firm_id"]
    if body.case_id:
        background_tasks.add_task(ingest_case, body.case_id, firm_id)
    else:
        background_tasks.add_task(ingest_standalone_events, firm_id)
        if current_user["role"] not in ("FIRM_ADMIN", "SUPER_ADMIN"):
            background_tasks.add_task(ingest_standalone_events, firm_id, current_user["id"])
    return created[0]


@router.put("/events/{event_id}")
async def update_event(event_id: str, body: CreateEventRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    for field in ("recurrence_count", "recurrence_until", "recurrence", "participant_ids"):
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
    updated = result.data[0]

    # Upsert any new participants
    if body.participant_ids:
        new_rows = [
            {"event_id": event_id, "user_id": uid, "participant_type": "TEAM_MEMBER"}
            for uid in body.participant_ids
        ]
        try:
            supabase.table("calendar_event_participant").upsert(
                new_rows, on_conflict="event_id,user_id"
            ).execute()
        except Exception as e:
            _log.warning(f"[update_event] participant upsert skipped: {e}")

    # Notify all current participants (excluding the updater)
    try:
        parts_res = (
            supabase.table("calendar_event_participant")
            .select("user_id")
            .eq("event_id", event_id)
            .execute()
        )
        all_ids = [r["user_id"] for r in (parts_res.data or [])]
        _notify_participants(
            event_id=event_id,
            title=updated.get("title", ""),
            label=_ev_label(body.event_type),
            start=updated.get("start_datetime", ""),
            participant_ids=all_ids,
            exclude_user_id=current_user["id"],
            action="Updated",
            event_type=body.event_type,
        )
    except Exception as e:
        _log.warning(f"[update_event] notification skipped: {e}")

    firm_id = current_user["firm_id"]
    if case_id := updated.get("case_id"):
        background_tasks.add_task(ingest_case, case_id, firm_id)
    else:
        background_tasks.add_task(ingest_standalone_events, firm_id)
        if current_user["role"] not in ("FIRM_ADMIN", "SUPER_ADMIN"):
            background_tasks.add_task(ingest_standalone_events, firm_id, current_user["id"])
    return updated


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    ev = supabase.table("calendar_event").select("title, case_id, event_type, created_by") \
        .eq("id", event_id).eq("firm_id", current_user["firm_id"]).maybe_single().execute()
    ev_data    = ev.data or {}
    case_id    = ev_data.get("case_id")
    title      = ev_data.get("title") or ev_data.get("event_type") or "Event"
    created_by = ev_data.get("created_by")
    firm_id    = current_user["firm_id"]

    supabase.table("calendar_event").delete().eq("id", event_id).eq("firm_id", firm_id).execute()

    if case_id:
        try:
            supabase.table("case_timeline").insert({
                "case_id":      case_id,
                "firm_id":      firm_id,
                "action":       f'Event deleted: "{title}"',
                "performed_by": current_user["id"],
            }).execute()
        except Exception:
            pass
        background_tasks.add_task(ingest_case, case_id, firm_id)
    else:
        background_tasks.add_task(ingest_standalone_events, firm_id)
        lawyer_to_update = created_by if created_by else current_user["id"]
        background_tasks.add_task(ingest_standalone_events, firm_id, lawyer_to_update)

    return {"message": "Event deleted"}


# ─── GET /api/calendar/available-participants ────────────────────────────────

@router.get("/available-participants")
async def get_available_participants(
    case_id: Optional[str] = None,
    current_user=Depends(get_lawyer),
):
    """
    Return users that can be added as participants to an event.
    - If case_id is given: case team members + client (if they have an account).
    - Otherwise: all active members of the firm (excluding the requester).
    """
    firm_id = current_user["firm_id"]

    if case_id:
        participants: list[dict] = []

        # ── Team members (excluding the current user) ─────────────────────────
        team_res = supabase.table("case_team").select("user_id").eq("case_id", case_id).execute()
        team_ids = [r["user_id"] for r in (team_res.data or []) if r["user_id"] != current_user["id"]]
        if team_ids:
            users_res = (
                supabase.table("app_user")
                .select("id, full_name, email, role")
                .in_("id", team_ids)
                .eq("is_active", True)
                .execute()
            )
            for u in (users_res.data or []):
                participants.append({
                    "user_id":          u["id"],
                    "full_name":        u.get("full_name") or "",
                    "email":            u.get("email") or "",
                    "role":             u.get("role") or "LAWYER",
                    "participant_type": "TEAM_MEMBER",
                })

        # ── Client ────────────────────────────────────────────────────────────
        case_res = (
            supabase.table("case_file")
            .select("client_id")
            .eq("id", case_id)
            .maybe_single()
            .execute()
        )
        if case_res and case_res.data:
            client_id = case_res.data.get("client_id")
            if client_id:
                client_res = (
                    supabase.table("client")
                    .select("user_id, first_name, last_name, email")
                    .eq("id", client_id)
                    .maybe_single()
                    .execute()
                )
                if client_res and client_res.data:
                    c = client_res.data
                    client_user_id = c.get("user_id")
                    if client_user_id:
                        user_res = (
                            supabase.table("app_user")
                            .select("id, full_name, email")
                            .eq("id", client_user_id)
                            .maybe_single()
                            .execute()
                        )
                        if user_res and user_res.data:
                            u = user_res.data
                            # avoid duplicate if client is also a team member
                            if not any(p["user_id"] == u["id"] for p in participants):
                                participants.append({
                                    "user_id":          u["id"],
                                    "full_name":        u.get("full_name") or f"{c.get('first_name','')} {c.get('last_name','')}".strip(),
                                    "email":            u.get("email") or c.get("email") or "",
                                    "role":             "CLIENT",
                                    "participant_type": "CLIENT",
                                })

        return participants

    # ── No case selected: all firm lawyers + current user's clients ──────────
    result = []

    # All active lawyers/admins in the firm (excluding current user)
    lawyers_res = (
        supabase.table("app_user")
        .select("id, full_name, email, role")
        .eq("firm_id", firm_id)
        .eq("is_active", True)
        .in_("role", ["LAWYER", "FIRM_ADMIN", "SUPER_ADMIN"])
        .neq("id", current_user["id"])
        .execute()
    )
    for u in (lawyers_res.data or []):
        result.append({
            "user_id":          u["id"],
            "full_name":        u.get("full_name") or "",
            "email":            u.get("email") or "",
            "role":             u.get("role") or "LAWYER",
            "participant_type": "TEAM_MEMBER",
        })

    # Only clients linked to cases where current user is a team member
    team_res = (
        supabase.table("case_team")
        .select("case_id")
        .eq("user_id", current_user["id"])
        .execute()
    )
    my_case_ids = [r["case_id"] for r in (team_res.data or [])]
    if my_case_ids:
        cases_res = (
            supabase.table("case_file")
            .select("client_id")
            .in_("id", my_case_ids)
            .eq("firm_id", firm_id)
            .execute()
        )
        client_ids = list({r["client_id"] for r in (cases_res.data or []) if r.get("client_id")})
        if client_ids:
            clients_res = (
                supabase.table("client")
                .select("user_id, first_name, last_name, email")
                .in_("id", client_ids)
                .execute()
            )
            client_user_ids = [r["user_id"] for r in (clients_res.data or []) if r.get("user_id")]
            if client_user_ids:
                cu_res = (
                    supabase.table("app_user")
                    .select("id, full_name, email")
                    .in_("id", client_user_ids)
                    .eq("is_active", True)
                    .execute()
                )
                existing_ids = {p["user_id"] for p in result}
                for u in (cu_res.data or []):
                    if u["id"] not in existing_ids:
                        result.append({
                            "user_id":          u["id"],
                            "full_name":        u.get("full_name") or "",
                            "email":            u.get("email") or "",
                            "role":             "CLIENT",
                            "participant_type": "CLIENT",
                        })

    return result


# ─── POST /api/calendar/sync/google/save-token (mobile OAuth) ───────────────

class SaveTokenRequest(BaseModel):
    access_token:  str
    refresh_token: Optional[str] = None
    expires_in:    Optional[int] = None

class ExchangeCodeRequest(BaseModel):
    code:         str
    redirect_uri: str

@router.post("/sync/google/exchange-code")
async def exchange_google_code(body: ExchangeCodeRequest, current_user=Depends(get_lawyer)):
    """Mobile OAuth: receive auth code, exchange for tokens server-side (has client_secret)."""
    import time
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth2 not configured")
    token_resp = _req.post("https://oauth2.googleapis.com/token", data={
        "code":          body.code,
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri":  body.redirect_uri,
        "grant_type":    "authorization_code",
    }, timeout=15)
    if not token_resp.ok:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_resp.text}")
    tokens = token_resp.json()
    supabase_admin.table("user_oauth_token").upsert({
        "user_id":       current_user["id"],
        "provider":      "google",
        "access_token":  tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at":    int(time.time()) + tokens.get("expires_in", 3600),
    }, on_conflict="user_id,provider").execute()
    return {"message": "Google Calendar connected successfully"}


@router.post("/sync/google/save-token")
async def save_google_token(body: SaveTokenRequest, current_user=Depends(get_lawyer)):
    import time
    supabase_admin.table("user_oauth_token").upsert({
        "user_id":       current_user["id"],
        "provider":      "google",
        "access_token":  body.access_token,
        "refresh_token": body.refresh_token,
        "expires_at":    int(time.time()) + body.expires_in if body.expires_in else None,
    }, on_conflict="user_id,provider").execute()
    return {"message": "Google Calendar connected successfully"}


# ─── GET /api/calendar/sync/google/auth-url ─────────────────────────────────

@router.get("/sync/google/auth-url")
async def google_auth_url(mobile_callback: Optional[str] = None, current_user=Depends(get_lawyer)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth2 not configured (set GOOGLE_CLIENT_ID in .env)")
    # Encode user_id + optional mobile deep-link callback in state
    state_data = {"user_id": current_user["id"]}
    if mobile_callback:
        state_data["mobile_callback"] = mobile_callback
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode().rstrip("=")
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={settings.GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=https://www.googleapis.com/auth/calendar"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={state}"
    )
    return {"auth_url": url}


# ─── GET /api/calendar/sync/google/callback ──────────────────────────────────

@router.get("/sync/google/callback")
async def google_callback(code: str, state: str):
    import time
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth2 not configured")

    # Decode state
    try:
        padding = 4 - len(state) % 4
        state_data = json.loads(base64.urlsafe_b64decode(state + "=" * padding).decode())
        user_id         = state_data["user_id"]
        mobile_callback = state_data.get("mobile_callback")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    token_resp = _req.post("https://oauth2.googleapis.com/token", data={
        "code":          code,
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
        "grant_type":    "authorization_code",
    }, timeout=15)
    if not token_resp.ok:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_resp.text}")
    tokens = token_resp.json()
    supabase_admin.table("user_oauth_token").upsert({
        "user_id":       user_id,
        "provider":      "google",
        "access_token":  tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at":    int(time.time()) + tokens.get("expires_in", 3600),
    }, on_conflict="user_id,provider").execute()

    # Redirect back to the mobile app via deep link (works in Expo Go + standalone)
    if mobile_callback:
        return RedirectResponse(url=mobile_callback)
    return {"message": "Google Calendar connected successfully", "user_id": user_id}


# ─── Token refresh helper ────────────────────────────────────────────────────

def _get_valid_access_token(user_id: str, token_data: dict) -> str:
    """
    Return a valid Google access token, refreshing it first if it has expired
    (or will expire within the next 5 minutes).
    Persists the new token to user_oauth_token when a refresh is performed.
    """
    import time
    expires_at    = token_data.get("expires_at")
    access_token  = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")

    token_is_expired = expires_at is not None and int(time.time()) >= (expires_at - 300)

    if not token_is_expired:
        return access_token

    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Google access token expired and no refresh token is stored. "
                   "Please reconnect Google Calendar.",
        )

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth2 not configured on server")

    resp = _req.post("https://oauth2.googleapis.com/token", data={
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
    }, timeout=15)

    if not resp.ok:
        raise HTTPException(
            status_code=401,
            detail=f"Google token refresh failed: {resp.text}. "
                   "Please reconnect Google Calendar.",
        )

    new_tokens   = resp.json()
    new_access   = new_tokens["access_token"]
    new_expires  = int(time.time()) + new_tokens.get("expires_in", 3600)
    # Google only issues a new refresh_token occasionally; keep the old one if absent
    new_refresh  = new_tokens.get("refresh_token") or refresh_token

    supabase_admin.table("user_oauth_token").upsert({
        "user_id":       user_id,
        "provider":      "google",
        "access_token":  new_access,
        "refresh_token": new_refresh,
        "expires_at":    new_expires,
    }, on_conflict="user_id,provider").execute()

    _log.info(f"[google-sync] refreshed access token for user {user_id}")
    return new_access


# ─── POST /api/calendar/sync/google ──────────────────────────────────────────

def _strip_utc_marker(dt_str: str) -> str:
    """
    The app stores local time with a Z suffix (e.g. '2026-05-10T09:00:00.000Z')
    meaning the user entered 09:00 local time. To avoid a +1h shift in Google
    Calendar we remove the UTC marker and declare the timezone explicitly.
    """
    if not dt_str:
        return dt_str
    import re
    return re.sub(r"(Z|[+-]\d{2}:?\d{2})$", "", dt_str)


APP_TIMEZONE = "Africa/Tunis"   # change here if the firm's timezone ever differs


@router.post("/sync/google")
async def sync_to_google(current_user=Depends(get_lawyer)):
    token_res = (
        supabase.table("user_oauth_token")
        .select("*")
        .eq("user_id", current_user["id"])
        .eq("provider", "google")
        .maybe_single()
        .execute()
    )
    if not token_res or not token_res.data:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar not connected. Call /api/calendar/sync/google/auth-url first.",
        )

    access_token = _get_valid_access_token(current_user["id"], token_res.data)
    user_id      = current_user["id"]
    firm_id      = current_user["firm_id"]

    # 1. Events created by the user
    created_res = (
        supabase.table("calendar_event")
        .select("*")
        .eq("firm_id", firm_id)
        .eq("created_by", user_id)
        .execute()
    )
    created_events = created_res.data or []

    # 2. Events where user is a participant but did not create
    part_res = (
        supabase.table("calendar_event_participant")
        .select("event_id")
        .eq("user_id", user_id)
        .execute()
    )
    participated_ids = [r["event_id"] for r in (part_res.data or [])]
    participant_events = []
    if participated_ids:
        pe_res = (
            supabase.table("calendar_event")
            .select("*")
            .eq("firm_id", firm_id)
            .in_("id", participated_ids)
            .neq("created_by", user_id)
            .execute()
        )
        participant_events = pe_res.data or []

    # Merge & deduplicate
    seen: set = set()
    events: list = []
    for ev in created_events + participant_events:
        if ev["id"] not in seen:
            seen.add(ev["id"])
            events.append(ev)

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    synced, failed = 0, 0
    for ev in events:
        raw_start = ev.get("start_datetime")
        raw_end   = ev.get("end_datetime") or raw_start
        if not raw_start:
            continue

        # Strip the UTC marker — times are stored as local (Africa/Tunis) disguised as UTC
        local_start = _strip_utc_marker(raw_start)
        local_end   = _strip_utc_marker(raw_end)

        g_event = {
            "summary":     ev.get("title", "LegalHub Event"),
            "description": ev.get("event_type", ""),
            "start":       {"dateTime": local_start, "timeZone": APP_TIMEZONE},
            "end":         {"dateTime": local_end,   "timeZone": APP_TIMEZONE},
            "iCalUID":     f"{ev['id']}@legalhub.app",
        }
        if ev.get("location"):
            g_event["location"] = ev["location"]

        resp = _req.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events/import",
            json=g_event, headers=headers, timeout=10,
        )
        if resp.ok:
            synced += 1
        else:
            failed += 1
            _log.warning(f"[google-sync] event {ev.get('id')} failed: {resp.text}")

    return {"synced": synced, "failed": failed, "total": len(events)}


# ─── GET /api/calendar/meeting-requests ────────────────────────────────────
@router.get("/meeting-requests")
async def list_meeting_requests(current_user=Depends(get_current_user)):
    """Demandes de rendez-vous en attente pour l'avocat connecté."""
    if current_user["role"] not in ("LAWYER", "FIRM_ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")

    result = (
        supabase.table("appointment_request")
        .select("*, client(id, first_name, last_name, email), case_file(id, title, case_number)")
        .eq("lawyer_user_id", current_user["id"])
        .eq("status", "PENDING")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ─── POST /api/calendar/meeting-requests/:id/accept ────────────────────────
@router.post("/meeting-requests/{request_id}/accept")
async def accept_meeting_request(request_id: str, body: dict, current_user=Depends(get_current_user)):
    """L'avocat accepte une demande de rendez-vous et crée l'événement calendrier."""
    if current_user["role"] not in ("LAWYER", "FIRM_ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")

    req = (
        supabase.table("appointment_request")
        .select("*")
        .eq("id", request_id)
        .eq("lawyer_user_id", current_user["id"])
        .eq("status", "PENDING")
        .maybe_single()
        .execute()
    )
    if not req or not req.data:
        raise HTTPException(status_code=404, detail="Meeting request not found or already handled")

    req_data = req.data
    meeting_type = req_data.get("meeting_type", "IN_PERSON")
    is_video     = meeting_type == "VIDEO"

    # Determine start/end datetimes
    start_dt = body.get("start_datetime") or req_data.get("preferred_date")
    end_dt   = body.get("end_datetime")
    if not end_dt and start_dt:
        try:
            start_obj = datetime.fromisoformat(start_dt.replace("Z", "+00:00"))
            end_dt    = (start_obj + timedelta(hours=1)).isoformat()
        except Exception:
            end_dt = start_dt

    # Create calendar event
    event_data = {
        "firm_id":        req_data["firm_id"],
        "case_id":        req_data.get("case_id"),
        "title":          body.get("title") or req_data.get("title", "Meeting"),
        "event_type":     "MEETING",
        "start_datetime": start_dt,
        "end_datetime":   end_dt,
        "location":       body.get("location"),
        "is_video_call":  is_video,
        "video_call_url": body.get("video_call_url") if is_video else None,
        "created_by":     current_user["id"],
    }
    event_result = supabase.table("calendar_event").insert(event_data).execute()
    event        = event_result.data[0] if event_result.data else None
    event_id     = event["id"] if event else None

    if event_id:
        # Lawyer as HOST
        supabase.table("calendar_event_participant").insert({
            "event_id":         event_id,
            "user_id":          current_user["id"],
            "participant_type": "HOST",
        }).execute()

        # Client as ATTENDEE — look up client's user_id
        client_res = (
            supabase.table("client")
            .select("user_id")
            .eq("id", req_data["client_id"])
            .maybe_single()
            .execute()
        )
        client_user_id = (client_res.data or {}).get("user_id") if client_res else None
        if client_user_id:
            supabase.table("calendar_event_participant").insert({
                "event_id":         event_id,
                "user_id":          client_user_id,
                "participant_type": "ATTENDEE",
            }).execute()

        # Update request status
        supabase.table("appointment_request").update({
            "status":   "ACCEPTED",
            "event_id": event_id,
        }).eq("id", request_id).execute()

        # Add timeline entry if the meeting is linked to a case
        if req_data.get("case_id"):
            meeting_title = body.get("title") or req_data.get("title", "Meeting")
            date_display  = _fmt_event_dt(start_dt) if start_dt else ""
            supabase.table("case_timeline").insert({
                "case_id":      req_data["case_id"],
                "firm_id":      req_data["firm_id"],
                "action":       f"Meeting scheduled: {meeting_title} — {date_display}",
                "performed_by": current_user["id"],
            }).execute()

        # Notify client
        if client_user_id:
            lawyer_user = (
                supabase.table("app_user")
                .select("full_name")
                .eq("id", current_user["id"])
                .maybe_single()
                .execute()
            )
            lawyer_name = (lawyer_user.data or {}).get("full_name", "Your lawyer") if lawyer_user else "Your lawyer"
            date_display = _fmt_event_dt(start_dt) if start_dt else "—"

            notif_msg = json.dumps({
                "event_title":    body.get("title") or req_data.get("title", "Meeting"),
                "event_type":     "MEETING",
                "date_display":   date_display,
                "case_title":     "",
                "lawyer_name":    lawyer_name,
                "is_video":       is_video,
                "video_call_url": body.get("video_call_url") if is_video else None,
                "location":       body.get("location"),
                "status":         "ACCEPTED",
            }, ensure_ascii=False)

            supabase_admin.table("notification").insert({
                "user_id": client_user_id,
                "type":    "MEETING_REQUEST",
                "title":   f"Meeting Confirmed — {lawyer_name}",
                "message": notif_msg,
            }).execute()

    return event or {"status": "accepted"}


# ─── POST /api/calendar/meeting-requests/:id/reject ────────────────────────
@router.post("/meeting-requests/{request_id}/reject")
async def reject_meeting_request(request_id: str, body: dict, current_user=Depends(get_current_user)):
    """L'avocat refuse une demande de rendez-vous."""
    if current_user["role"] not in ("LAWYER", "FIRM_ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")

    req = (
        supabase.table("appointment_request")
        .select("*")
        .eq("id", request_id)
        .eq("lawyer_user_id", current_user["id"])
        .eq("status", "PENDING")
        .maybe_single()
        .execute()
    )
    if not req or not req.data:
        raise HTTPException(status_code=404, detail="Meeting request not found or already handled")

    req_data = req.data
    reason   = body.get("reason", "")

    supabase.table("appointment_request").update({
        "status":           "REJECTED",
        "rejection_reason": reason,
    }).eq("id", request_id).execute()

    # Add timeline entry if linked to a case
    if req_data.get("case_id"):
        supabase.table("case_timeline").insert({
            "case_id":      req_data["case_id"],
            "firm_id":      req_data["firm_id"],
            "action":       f"Meeting request declined: {req_data.get('title', 'Meeting')}" + (f" — {reason}" if reason else ""),
            "performed_by": current_user["id"],
        }).execute()

    # Notify client
    client_res = (
        supabase.table("client")
        .select("user_id")
        .eq("id", req_data["client_id"])
        .maybe_single()
        .execute()
    )
    client_user_id = (client_res.data or {}).get("user_id") if client_res else None
    if client_user_id:
        lawyer_user = (
            supabase.table("app_user")
            .select("full_name")
            .eq("id", current_user["id"])
            .maybe_single()
            .execute()
        )
        lawyer_name = (lawyer_user.data or {}).get("full_name", "Your lawyer") if lawyer_user else "Your lawyer"

        supabase_admin.table("notification").insert({
            "user_id": client_user_id,
            "type":    "MEETING_REQUEST",
            "title":   "Meeting Request Declined",
            "message": json.dumps({
                "status":        "REJECTED",
                "request_title": req_data.get("title"),
                "lawyer_name":   lawyer_name,
                "reason":        reason,
            }, ensure_ascii=False),
        }).execute()

    return {"status": "rejected"}


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
