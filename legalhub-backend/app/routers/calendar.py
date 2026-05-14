import json
import base64
import logging
import requests as _req
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase, supabase_admin
from app.core.email import send_event_reminder_email
from app.core.config import settings
from pydantic import BaseModel, model_validator
from typing import Optional, List, Literal
from app.models.enums import EventType
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta

_log = logging.getLogger(__name__)

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

        # 1. Events created by the user
        q_created = _apply_filters(
            supabase.table("calendar_event").select("*").eq("firm_id", firm_id).eq("created_by", user_id)
        )
        events_created = (q_created.execute()).data or []

        # 2. Events where user is explicitly a participant (created by others)
        part_res = (
            supabase.table("calendar_event_participant")
            .select("event_id")
            .eq("user_id", user_id)
            .execute()
        )
        participated_ids = [r["event_id"] for r in (part_res.data or [])]
        events_participated = []
        if participated_ids:
            q_part = _apply_filters(
                supabase.table("calendar_event").select("*")
                .eq("firm_id", firm_id)
                .in_("id", participated_ids)
                .neq("created_by", user_id)
            )
            events_participated = (q_part.execute()).data or []

        # 3. Backward compat: events on user's cases that have NO participants at all
        team = supabase.table("case_team").select("case_id").eq("user_id", user_id).execute()
        lawyer_case_ids = [r["case_id"] for r in (team.data or [])]
        events_noparts = []
        if lawyer_case_ids:
            q_case = _apply_filters(
                supabase.table("calendar_event").select("*")
                .eq("firm_id", firm_id)
                .in_("case_id", lawyer_case_ids)
                .neq("created_by", user_id)
            )
            case_events = (q_case.execute()).data or []
            if case_events:
                case_event_ids = [ev["id"] for ev in case_events]
                parts_check = (
                    supabase.table("calendar_event_participant")
                    .select("event_id")
                    .in_("event_id", case_event_ids)
                    .execute()
                )
                ids_with_parts = {r["event_id"] for r in (parts_check.data or [])}
                events_noparts = [ev for ev in case_events if ev["id"] not in ids_with_parts]

        # Merge, deduplicate, sort
        seen = set()
        merged = []
        for ev in events_created + events_participated + events_noparts:
            if ev["id"] not in seen:
                seen.add(ev["id"])
                merged.append(ev)
        merged.sort(key=lambda x: x.get("start_datetime") or "")
        return merged

    query = supabase.table("calendar_event").select("*").eq("firm_id", firm_id)
    if event_type:
        query = query.eq("event_type", event_type)
    if case_id:
        query = query.eq("case_id", case_id)
    if from_date:
        query = query.gte("start_datetime", from_date)
    return (query.order("start_datetime").execute()).data or []


@router.post("/events", status_code=201)
async def create_event(body: CreateEventRequest, current_user=Depends(get_lawyer)):
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
    if body.participant_ids and created:
        participant_rows = [
            {"event_id": ev["id"], "user_id": uid, "participant_type": "TEAM_MEMBER"}
            for ev in created
            for uid in body.participant_ids
        ]
        try:
            supabase.table("calendar_event_participant").insert(participant_rows).execute()
        except Exception as e:
            _log.warning(f"[create_event] participant insert skipped: {e}")

    if body.case_id:
        _EVENT_LABELS = {
            "HEARING": "Court Hearing", "COURT_DATE": "Court Date",
            "MEETING": "Meeting", "CONSULTATION": "Consultation",
            "DEADLINE": "Deadline", "FILING": "Filing",
            "DEPOSITION": "Deposition", "MEDIATION": "Mediation",
            "ARBITRATION": "Arbitration",
        }
        _raw_type = body.event_type.value if hasattr(body.event_type, "value") else str(body.event_type).split(".")[-1]
        ev_label = _EVENT_LABELS.get(
            _raw_type.upper(),
            _raw_type.replace("_", " ").title(),
        )
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
                "title":   f"New {ev_label} Scheduled",
                "message": json.dumps(msg_data),
            }).execute()

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[create_event] client notification skipped: {e}")

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

@router.post("/sync/google")
async def sync_to_google(current_user=Depends(get_lawyer)):
    token_res = supabase.table("user_oauth_token").select("*").eq("user_id", current_user["id"]).eq("provider", "google").maybe_single().execute()
    if not token_res or not token_res.data:
        raise HTTPException(status_code=400, detail="Google Calendar not connected. Call /api/calendar/sync/google/auth-url first.")

    access_token = _get_valid_access_token(current_user["id"], token_res.data)
    events_res   = supabase.table("calendar_event").select("*").eq("firm_id", current_user["firm_id"]).eq("created_by", current_user["id"]).execute()
    events       = events_res.data or []

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    synced, failed = 0, 0
    for ev in events:
        start = ev.get("start_datetime")
        end   = ev.get("end_datetime") or start
        if not start:
            continue
        g_event = {
            "summary":     ev.get("title", "LegalHub Event"),
            "description": ev.get("event_type", ""),
            "start":       {"dateTime": start, "timeZone": "UTC"},
            "end":         {"dateTime": end,   "timeZone": "UTC"},
            # Deterministic UID so repeated syncs update instead of duplicate
            "iCalUID":     f"{ev['id']}@legalhub.app",
        }
        if ev.get("location"):
            g_event["location"] = ev["location"]
        # /events/import upserts by iCalUID — idempotent across multiple syncs
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
