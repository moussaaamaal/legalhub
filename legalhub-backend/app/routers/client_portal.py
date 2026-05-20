"""
Client Portal Router — /api/client/*
Routes réservées au rôle CLIENT pour accéder à leurs propres données.
"""
import uuid
import re
import unicodedata
import json
import logging
from datetime import date
from typing import Optional
from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.core.dependencies import get_current_user
from app.core.database import supabase, supabase_admin
from app.models.enums import UserRole

_log = logging.getLogger(__name__)

def _sanitize(filename: str) -> str:
    n = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode("ascii")
    n = re.sub(r"[^\w.\-]", "_", n)
    return re.sub(r"_+", "_", n).strip("_") or "file"

def _file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf": return "PDF"
    if ext in ("doc", "docx"): return "WORD"
    if ext in ("jpg", "jpeg", "png", "gif", "webp"): return "IMAGE"
    return "OTHER"

router = APIRouter(prefix="/api/client", tags=["Client Portal"])


def _require_client(current_user=Depends(get_current_user)):
    """Vérifie que l'utilisateur est un CLIENT et retourne son enregistrement client."""
    if current_user["role"] != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Access reserved for clients")

    client_result = (
        supabase.table("client")
        .select("*")
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not client_result or not client_result.data:
        raise HTTPException(status_code=404, detail="Client profile not found")

    return {"user": current_user, "client": client_result.data}


# ─── GET /api/client/dashboard ──────────────────────────

@router.get("/dashboard")
async def client_dashboard(ctx=Depends(_require_client)):
    """Stats du tableau de bord client : dossiers actifs, factures en attente, documents."""
    client = ctx["client"]
    client_id = client["id"]
    firm_id = client["firm_id"]
    today = date.today().isoformat()

    # Dossiers
    cases = (
        supabase.table("case_file")
        .select("id, status")
        .eq("client_id", client_id)
        .eq("firm_id", firm_id)
        .execute()
    )
    case_data = cases.data or []
    active_cases = len([c for c in case_data if c["status"] not in ("SETTLED", "CLOSED")])

    # Factures en attente
    invoices = (
        supabase.table("invoice")
        .select("id, total_amount, status")
        .eq("client_id", client_id)
        .in_("status", ["PENDING", "OVERDUE"])
        .execute()
    )
    invoice_data = invoices.data or []
    pending_invoices_total = sum(i["total_amount"] for i in invoice_data)
    pending_invoices_count = len(invoice_data)

    # Documents en attente (partagés mais pas encore téléchargés par le client)
    docs = (
        supabase.table("document")
        .select("id, status")
        .eq("firm_id", firm_id)
        .eq("is_shared_with_client", True)
        .in_("status", ["PENDING_REVIEW"])
        .execute()
    )
    pending_docs = len(docs.data or [])

    # Prochain rendez-vous — filtrés par participation du client
    client_case_ids = [c["id"] for c in case_data]
    upcoming_raw = []
    if client_case_ids:
        appt_res = (
            supabase.table("calendar_event")
            .select("id, title, start_datetime, event_type, location, case_id")
            .eq("firm_id", firm_id)
            .in_("case_id", client_case_ids)
            .gte("start_datetime", today)
            .order("start_datetime")
            .limit(20)
            .execute()
        )
        raw_events = appt_res.data or []
        if raw_events:
            raw_ids = [ev["id"] for ev in raw_events]
            client_user_id = ctx["user"]["id"]
            part_res = (
                supabase.table("calendar_event_participant")
                .select("event_id")
                .eq("user_id", client_user_id)
                .in_("event_id", raw_ids)
                .execute()
            )
            client_part_ids = {r["event_id"] for r in (part_res.data or [])}
            all_parts_res = (
                supabase.table("calendar_event_participant")
                .select("event_id")
                .in_("event_id", raw_ids)
                .execute()
            )
            ids_with_any_part = {r["event_id"] for r in (all_parts_res.data or [])}
            upcoming_raw = [
                ev for ev in raw_events
                if ev["id"] in client_part_ids or ev["id"] not in ids_with_any_part
            ][:3]

    return {
        "active_cases": active_cases,
        "pending_invoices_total": round(pending_invoices_total, 2),
        "pending_invoices_count": pending_invoices_count,
        "pending_documents": pending_docs,
        "upcoming_appointments": upcoming_raw,
        "client": {
            "id": client["id"],
            "first_name": client["first_name"],
            "last_name": client["last_name"],
            "email": client["email"],
            "tag": client.get("tag"),
            "avatar_url": ctx["user"].get("avatar_url"),
        }
    }


# ─── GET /api/client/cases ───────────────────────────────

@router.get("/cases")
async def client_cases(ctx=Depends(_require_client)):
    """Tous les dossiers du client connecté."""
    client = ctx["client"]

    result = (
        supabase.table("case_file")
        .select(
            "id, case_number, title, status, priority, case_type, "
            "practice_area, progress_percent, created_at, updated_at, "
            "first_hearing_date, court_name, lawyer_id"
        )
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .order("updated_at", desc=True)
        .execute()
    )
    cases = result.data or []

    # Attach lawyer name to each case
    lawyer_ids = list({c["lawyer_id"] for c in cases if c.get("lawyer_id")})
    if lawyer_ids:
        lawyers_res = (
            supabase.table("lawyer")
            .select("id, app_user(full_name)")
            .in_("id", lawyer_ids)
            .execute()
        )
        name_map = {}
        for l in (lawyers_res.data or []):
            u = l.get("app_user") or {}
            name_map[l["id"]] = u.get("full_name")
        for c in cases:
            if c.get("lawyer_id"):
                c["lawyer_name"] = name_map.get(c["lawyer_id"])

    return cases


# ─── GET /api/client/cases/:case_id ─────────────────────

@router.get("/cases/{case_id}")
async def client_case_detail(case_id: str, ctx=Depends(_require_client)):
    """Détail d'un dossier spécifique du client."""
    client = ctx["client"]

    result = (
        supabase.table("case_file")
        .select("*")
        .eq("id", case_id)
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    # Récupérer l'équipe complète du dossier
    case = result.data
    team_result = (
        supabase.table("case_team")
        .select("user_id, app_user(full_name, email, avatar_url, role)")
        .eq("case_id", case_id)
        .execute()
    )
    team_members = team_result.data or []

    # Enrichir avec les titres du tableau lawyer
    user_ids = [m["user_id"] for m in team_members if m.get("user_id")]
    lawyer_titles: dict = {}
    if user_ids:
        lw_res = (
            supabase.table("lawyer")
            .select("user_id, title, specializations")
            .in_("user_id", user_ids)
            .execute()
        )
        for lw in (lw_res.data or []):
            lawyer_titles[lw["user_id"]] = {
                "title":           lw.get("title"),
                "specializations": lw.get("specializations") or [],
            }

    case["team"] = []
    for m in team_members:
        uid = m.get("user_id")
        u   = m.get("app_user") or {}
        lw  = lawyer_titles.get(uid, {})
        case["team"].append({
            "user_id":         uid,
            "full_name":       u.get("full_name"),
            "email":           u.get("email"),
            "avatar_url":      u.get("avatar_url"),
            "title":           lw.get("title"),
            "specializations": lw.get("specializations", []),
            "is_lead":         uid and case.get("lawyer_id") and
                               # compare via lawyer table: find lawyer with this user_id
                               any(
                                   lw2.get("user_id") == uid
                                   for lw2 in (lw_res.data if user_ids else [])
                                   if lw2.get("id") == case.get("lawyer_id")
                                   or lw2.get("user_id") == uid
                               ),
        })

    # Marquer le lead attorney séparément (rétro-compatibilité)
    if case.get("lawyer_id"):
        lawyer_user = (
            supabase.table("lawyer")
            .select("user_id, title, app_user(full_name, email, avatar_url, phone)")
            .eq("id", case["lawyer_id"])
            .maybe_single()
            .execute()
        )
        if lawyer_user and lawyer_user.data:
            u  = lawyer_user.data.get("app_user") or {}
            lead_uid = lawyer_user.data.get("user_id")
            case["lead_attorney"] = {
                "full_name":  u.get("full_name"),
                "email":      u.get("email"),
                "phone":      u.get("phone"),
                "avatar_url": u.get("avatar_url"),
                "title":      lawyer_user.data.get("title"),
                "user_id":    lead_uid,
            }
            # Flag is_lead in team list
            for member in case["team"]:
                if member["user_id"] == lead_uid:
                    member["is_lead"] = True

    # Timeline du dossier
    timeline = (
        supabase.table("case_timeline")
        .select("action, created_at")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    case["timeline"] = timeline.data or []

    return case


# ─── GET /api/client/invoices ────────────────────────────

@router.get("/invoices")
async def client_invoices(status: str | None = None, ctx=Depends(_require_client)):
    """Toutes les factures du client connecté."""
    client = ctx["client"]

    query = (
        supabase.table("invoice")
        .select("*, invoice_item(*)")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
    )
    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()
    return result.data or []


# ─── GET /api/client/invoices/:invoice_id ───────────────

@router.get("/invoices/{invoice_id}")
async def client_invoice_detail(invoice_id: str, ctx=Depends(_require_client)):
    """Détail d'une facture spécifique."""
    client = ctx["client"]

    result = (
        supabase.table("invoice")
        .select("*, invoice_item(*)")
        .eq("id", invoice_id)
        .eq("client_id", client["id"])
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Invoice not found or access denied")
    return result.data


# ─── GET /api/client/documents ───────────────────────────

@router.get("/documents")
async def client_documents(case_id: Optional[str] = None, ctx=Depends(_require_client)):
    """Documents partagés avec le client connecté, filtrables par case_id."""
    client = ctx["client"]

    cases_result = (
        supabase.table("case_file")
        .select("id")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .execute()
    )
    all_case_ids = [c["id"] for c in (cases_result.data or [])]

    if not all_case_ids:
        return []

    # If a specific case is requested, verify it belongs to this client
    if case_id:
        if case_id not in all_case_ids:
            return []
        filter_ids = [case_id]
    else:
        filter_ids = all_case_ids

    result = (
        supabase.table("document")
        .select("id, file_name, file_type, file_size_mb, category, status, created_at, case_id, storage_url, uploaded_by")
        .eq("firm_id", client["firm_id"])
        .eq("is_shared_with_client", True)
        .in_("case_id", filter_ids)
        .order("created_at", desc=True)
        .execute()
    )
    docs = result.data or []

    # Batch-fetch uploader names and avatars
    uploader_ids = list({d["uploaded_by"] for d in docs if d.get("uploaded_by")})
    if uploader_ids:
        users_res = supabase.table("app_user").select("id, full_name, avatar_url").in_("id", uploader_ids).execute()
        user_map = {u["id"]: u for u in (users_res.data or [])}
        for d in docs:
            u = user_map.get(d.get("uploaded_by"))
            d["uploader_name"]       = u["full_name"]  if u else None
            d["uploader_avatar_url"] = u["avatar_url"] if u else None

    return docs


# ─── GET /api/client/appointments ────────────────────────

@router.get("/appointments")
async def client_appointments(case_id: Optional[str] = None, ctx=Depends(_require_client)):
    """Rendez-vous (passés et à venir) pour le client connecté, filtrables par case_id."""
    client = ctx["client"]

    cases_result = (
        supabase.table("case_file")
        .select("id")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .execute()
    )
    all_case_ids = [c["id"] for c in (cases_result.data or [])]

    if not all_case_ids:
        return []

    if case_id:
        if case_id not in all_case_ids:
            return []
        filter_ids = [case_id]
    else:
        filter_ids = all_case_ids

    result = (
        supabase.table("calendar_event")
        .select(
            "id, title, event_type, start_datetime, end_datetime, "
            "location, is_video_call, video_call_url, case_id"
        )
        .eq("firm_id", client["firm_id"])
        .in_("case_id", filter_ids)
        .order("start_datetime", desc=False)
        .limit(50)
        .execute()
    )

    events = result.data or []

    # Keep only events where client is a participant OR the event has no participants (backward compat)
    client_user_id = ctx["user"]["id"]
    if events:
        event_ids = [ev["id"] for ev in events]

        # Event IDs the client is explicitly invited to
        part_res = (
            supabase.table("calendar_event_participant")
            .select("event_id")
            .eq("user_id", client_user_id)
            .in_("event_id", event_ids)
            .execute()
        )
        client_participated = {r["event_id"] for r in (part_res.data or [])}

        # Event IDs that have at least one participant defined
        all_parts_res = (
            supabase.table("calendar_event_participant")
            .select("event_id")
            .in_("event_id", event_ids)
            .execute()
        )
        ids_with_any_part = {r["event_id"] for r in (all_parts_res.data or [])}

        events = [
            ev for ev in events
            if ev["id"] in client_participated or ev["id"] not in ids_with_any_part
        ]

    for ev in events:
        ev["start_time"]   = ev.pop("start_datetime", None)
        ev["meeting_type"] = ev.pop("event_type", "MEETING")
        ev["meeting_link"] = ev.pop("video_call_url", None)
    return events


# ─── GET /api/client/cases/:case_id/team ────────────────

@router.get("/cases/{case_id}/team")
async def client_case_team(case_id: str, ctx=Depends(_require_client)):
    """Membres de l'équipe assignée à un dossier du client (pour sélectionner un avocat)."""
    client = ctx["client"]

    case_check = (
        supabase.table("case_file")
        .select("id, lawyer_id")
        .eq("id", case_id)
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .maybe_single()
        .execute()
    )
    if not case_check.data:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    case_lead_lawyer_id = case_check.data.get("lawyer_id")

    team_result = (
        supabase.table("case_team")
        .select("user_id, app_user(full_name, email, avatar_url, role)")
        .eq("case_id", case_id)
        .execute()
    )
    team_members = team_result.data or []

    user_ids = [m["user_id"] for m in team_members if m.get("user_id")]
    lawyer_map: dict = {}
    if user_ids:
        lw_res = (
            supabase.table("lawyer")
            .select("user_id, id, title, specializations")
            .in_("user_id", user_ids)
            .execute()
        )
        for lw in (lw_res.data or []):
            lawyer_map[lw["user_id"]] = {
                "lawyer_id":       lw.get("id"),
                "title":           lw.get("title"),
                "specializations": lw.get("specializations") or [],
            }

    result = []
    for m in team_members:
        uid = m.get("user_id")
        u   = m.get("app_user") or {}
        if u.get("role") not in ("LAWYER", "FIRM_ADMIN"):
            continue
        lw  = lawyer_map.get(uid, {})
        result.append({
            "user_id":         uid,
            "full_name":       u.get("full_name"),
            "email":           u.get("email"),
            "avatar_url":      u.get("avatar_url"),
            "title":           lw.get("title"),
            "specializations": lw.get("specializations", []),
            "is_lead":         lw.get("lawyer_id") == case_lead_lawyer_id,
        })

    return result


# ─── POST /api/client/documents/upload ──────────────────

@router.post("/documents/upload", status_code=201)
async def client_upload_document(
    file: UploadFile = File(...),
    case_id: str = Form(...),
    original_name: Optional[str] = Form(None),
    ctx=Depends(_require_client),
):
    """Le client télécharge un document pour l'un de ses dossiers."""
    client = ctx["client"]
    user   = ctx["user"]

    case_check = (
        supabase.table("case_file")
        .select("id, title, lawyer_id")
        .eq("id", case_id)
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .maybe_single()
        .execute()
    )
    if not case_check.data:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    file_content = await file.read()
    file_name    = unquote(original_name) if original_name else (file.filename or "document")
    safe_name    = _sanitize(file_name)
    content_type = file.content_type or "application/octet-stream"

    try:
        supabase_admin.storage.create_bucket("documents", options={"public": True})
    except Exception as e:
        err = str(e).lower()
        if not any(k in err for k in ("already exists", "409", "duplicate", "already_exists", "violates unique")):
            raise HTTPException(status_code=500, detail=f"Storage setup failed: {e}")

    storage_path = f"{client['firm_id']}/{case_id}/{uuid.uuid4()}_{safe_name}"
    supabase_admin.storage.from_("documents").upload(
        storage_path, file_content, file_options={"content-type": content_type}
    )
    storage_url = supabase_admin.storage.from_("documents").get_public_url(storage_path)

    doc = supabase.table("document").insert({
        "firm_id":               client["firm_id"],
        "case_id":               case_id,
        "uploaded_by":           user["id"],
        "file_name":             file_name,
        "file_type":             _file_type(safe_name),
        "file_size_mb":          round(len(file_content) / (1024 * 1024), 4),
        "storage_url":           storage_url,
        "category":              "CLIENT_DOC",
        "status":                "PENDING_REVIEW",
        "is_shared_with_client": True,
    }).execute()

    lawyer_id = case_check.data.get("lawyer_id")
    _log.info(f"[upload_doc] case_id={case_id} lawyer_id={lawyer_id!r} file={file_name}")
    if lawyer_id:
        try:
            result = supabase_admin.table("notification").insert({
                "user_id": lawyer_id,
                "type":    "DOCUMENT_SHARED",
                "title":   "Document Uploaded by Client",
                "message": f"The client uploaded: {file_name}",
            }).execute()
            _log.info(f"[upload_doc] ✅ Lawyer notification inserted — notif_id={result.data[0].get('id') if result.data else 'unknown'}")
        except Exception as e:
            _log.error(f"[upload_doc] ❌ Lawyer notification failed: {e}")
    else:
        _log.warning(f"[upload_doc] ⚠️  No lawyer_id on case {case_id} — notification skipped")

    supabase.table("case_timeline").insert({
        "case_id":      case_id,
        "firm_id":      client["firm_id"],
        "action":       f"Client uploaded document: {file_name}",
        "performed_by": user["id"],
    }).execute()

    return doc.data[0]


@router.post("/appointments/request")
async def client_request_appointment(body: dict, ctx=Depends(_require_client)):
    """Le client demande un rendez-vous auprès d'un avocat spécifique de son équipe."""
    client = ctx["client"]

    # lawyer_user_id can come directly from body (new flow: client picked team member)
    # or fall back to the client's assigned_lawyer_id (legacy)
    target_lawyer_user_id: Optional[str] = body.get("lawyer_user_id")

    record = {
        "firm_id":          client["firm_id"],
        "client_id":        client["id"],
        "case_id":          body.get("case_id"),
        "lawyer_user_id":   target_lawyer_user_id,
        "title":            body.get("title", "Meeting Request"),
        "meeting_type":     body.get("meeting_type", "IN_PERSON"),
        "preferred_date":   body.get("preferred_date"),
        "notes":            body.get("notes"),
        "status":           "PENDING",
    }

    try:
        result = (
            supabase.table("appointment_request")
            .insert(record)
            .execute()
        )
        saved = result.data[0] if result.data else None
    except Exception as e:
        _log.error(f"[request_meeting] DB insert failed: {e}")
        saved = None

    request_id = saved.get("id") if saved else None

    # Resolve target lawyer user_id — fallback to assigned_lawyer if not provided
    if not target_lawyer_user_id and client.get("assigned_lawyer_id"):
        try:
            lw_res = (
                supabase.table("lawyer")
                .select("user_id")
                .eq("id", client["assigned_lawyer_id"])
                .maybe_single()
                .execute()
            )
            if lw_res and lw_res.data:
                target_lawyer_user_id = lw_res.data.get("user_id")
        except Exception:
            pass

    _log.info(
        f"[request_meeting] client_id={client.get('id')} "
        f"target_lawyer_user_id={target_lawyer_user_id!r} request_id={request_id!r}"
    )

    if target_lawyer_user_id:
        try:
            client_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "A client"

            case_title = None
            if record.get("case_id"):
                try:
                    case_res = (
                        supabase.table("case_file")
                        .select("title")
                        .eq("id", record["case_id"])
                        .maybe_single()
                        .execute()
                    )
                    if case_res and case_res.data:
                        case_title = case_res.data.get("title")
                except Exception:
                    pass

            notif_message = json.dumps({
                "client_name":    client_name,
                "request_title":  record["title"],
                "meeting_type":   record["meeting_type"],
                "preferred_date": record.get("preferred_date") or "",
                "notes":          record.get("notes") or "",
                "case_title":     case_title or "",
                "request_id":     request_id or "",
            }, ensure_ascii=False)

            notif_result = supabase_admin.table("notification").insert({
                "user_id": target_lawyer_user_id,
                "type":    "MEETING_REQUEST",
                "title":   f"New Meeting Request from {client_name}",
                "message": notif_message,
            }).execute()
            _log.info(
                f"[request_meeting] ✅ Lawyer notification inserted — "
                f"notif_id={notif_result.data[0].get('id') if notif_result.data else 'unknown'}"
            )
        except Exception as e:
            _log.error(f"[request_meeting] ❌ Lawyer notification failed: {e}")
    else:
        _log.warning(f"[request_meeting] ⚠️  No target lawyer resolved — notification skipped")

    # Timeline entry when client submits a meeting request
    if record.get("case_id"):
        try:
            supabase.table("case_timeline").insert({
                "case_id":      record["case_id"],
                "firm_id":      client["firm_id"],
                "action":       f"Meeting requested: {record['title']}",
                "performed_by": ctx["user"]["id"],
            }).execute()
        except Exception as e:
            _log.warning(f"[request_meeting] timeline insert failed: {e}")

    return saved if saved else {"status": "pending", "message": "Request received"}


# ─── GET /api/client/profile ──────────────────────────────

@router.get("/profile")
async def client_profile(ctx=Depends(_require_client)):
    """Profil complet du client connecté."""
    client = ctx["client"]
    user = ctx["user"]

    # Info cabinet
    firm_result = (
        supabase.table("firm")
        .select("name, email, phone, address, city, country")
        .eq("id", client["firm_id"])
        .maybe_single()
        .execute()
    )

    # Avocat référent
    attorney = None
    if client.get("assigned_lawyer_id"):
        atty_result = (
            supabase.table("lawyer")
            .select("title, specializations, app_user(full_name, email, phone, avatar_url)")
            .eq("id", client["assigned_lawyer_id"])
            .maybe_single()
            .execute()
        )
        if atty_result and atty_result.data:
            u = atty_result.data.get("app_user") or {}
            attorney = {
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "phone": u.get("phone"),
                "avatar_url": u.get("avatar_url"),
                "title": atty_result.data.get("title"),
                "specializations": atty_result.data.get("specializations"),
            }

    return {
        "user_id": user["id"],
        "client_id": client["id"],
        "first_name": client["first_name"],
        "last_name": client["last_name"],
        "email": client["email"],
        "phone": client.get("phone"),
        "whatsapp_number": client.get("whatsapp_number"),
        "date_of_birth": client.get("date_of_birth"),
        "gender": client.get("gender"),
        "nationality": client.get("nationality"),
        "occupation": client.get("occupation"),
        "company_name": client.get("company_name"),
        "address": client.get("address"),
        "client_type": client.get("client_type"),
        "tag": client.get("tag"),
        "created_at": client.get("created_at"),
        "avatar_url": user.get("avatar_url"),
        "firm": firm_result.data if (firm_result and firm_result.data) else None,
        "assigned_attorney": attorney,
    }


# ─── PUT /api/client/profile ─────────────────────────────

@router.put("/profile")
async def update_client_profile(body: dict, ctx=Depends(_require_client)):
    """Le client met à jour ses informations personnelles modifiables."""
    client = ctx["client"]

    EDITABLE_FIELDS = {
        "phone", "whatsapp_number", "date_of_birth", "gender",
        "nationality", "occupation", "company_name", "address",
    }

    updates = {k: v for k, v in body.items() if k in EDITABLE_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        supabase.table("client")
        .update(updates)
        .eq("id", client["id"])
        .execute()
    )
    return result.data[0] if result.data else {"message": "Profile updated"}


# ─── GET /api/client/activity ────────────────────────────

@router.get("/activity")
async def client_activity(ctx=Depends(_require_client)):
    """Timeline d'activité globale du client (tous ses dossiers)."""
    client = ctx["client"]

    cases_result = (
        supabase.table("case_file")
        .select("id")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .execute()
    )
    case_ids = [c["id"] for c in (cases_result.data or [])]

    if not case_ids:
        return []

    result = (
        supabase.table("case_timeline")
        .select("action, created_at, case_id")
        .in_("case_id", case_ids)
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    return result.data or []


# ─── GET /api/client/lawyers ─────────────────────────────

@router.get("/lawyers")
async def client_lawyers(ctx=Depends(_require_client)):
    """Tous les avocats assignés aux dossiers du client connecté."""
    client = ctx["client"]

    cases_result = (
        supabase.table("case_file")
        .select("id, title, case_number, lawyer_id")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .execute()
    )
    cases = cases_result.data or []

    # Build map: lawyer_id → list of cases
    lawyer_cases: dict = {}
    for c in cases:
        lid = c.get("lawyer_id")
        if lid:
            lawyer_cases.setdefault(lid, []).append({
                "id":          c["id"],
                "title":       c.get("title"),
                "case_number": c.get("case_number"),
            })

    if not lawyer_cases:
        # Fall back to assigned_lawyer if no cases have a lawyer_id
        if client.get("assigned_lawyer_id"):
            lawyer_cases[client["assigned_lawyer_id"]] = []
        else:
            return []

    lawyers_result = (
        supabase.table("lawyer")
        .select("id, title, specializations, app_user(full_name, email, phone, avatar_url)")
        .in_("id", list(lawyer_cases.keys()))
        .execute()
    )

    result = []
    for l in (lawyers_result.data or []):
        u = l.get("app_user") or {}
        result.append({
            "lawyer_id":       l["id"],
            "full_name":       u.get("full_name"),
            "email":           u.get("email"),
            "phone":           u.get("phone"),
            "avatar_url":      u.get("avatar_url"),
            "title":           l.get("title"),
            "specializations": l.get("specializations") or [],
            "cases":           lawyer_cases.get(l["id"], []),
        })
    return result


# ─── GET /api/client/document-requests ───────────────────

@router.get("/document-requests")
async def client_document_requests(ctx=Depends(_require_client)):
    """Demandes de documents envoyées par l'avocat au client connecté."""
    client = ctx["client"]
    result = (
        supabase.table("document_request")
        .select("*, case_file(id, title, case_number)")
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .order("created_at", desc=True)
        .execute()
    )
    requests = result.data or []

    # Attach the requesting lawyer's name to each request
    user_ids = list({r["requested_by"] for r in requests if r.get("requested_by")})
    if user_ids:
        users_res = (
            supabase.table("app_user")
            .select("id, full_name, avatar_url")
            .in_("id", user_ids)
            .execute()
        )
        user_map = {u["id"]: u for u in (users_res.data or [])}
        for r in requests:
            uid = r.get("requested_by")
            if uid and uid in user_map:
                r["requested_by_user"] = {
                    "full_name":  user_map[uid].get("full_name"),
                    "avatar_url": user_map[uid].get("avatar_url"),
                }

    return requests


# ─── POST /api/client/document-requests/:id/fulfill ──────

@router.post("/document-requests/{request_id}/fulfill", status_code=201)
async def fulfill_document_request(
    request_id: str,
    file: UploadFile = File(...),
    original_name: Optional[str] = Form(None),
    ctx=Depends(_require_client),
):
    """Le client télécharge le document demandé par son avocat."""
    client = ctx["client"]
    user   = ctx["user"]

    req = (
        supabase.table("document_request")
        .select("*")
        .eq("id", request_id)
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .maybe_single()
        .execute()
    )
    if not req.data:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.data["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Request is not pending")

    file_content = await file.read()
    file_name    = unquote(original_name) if original_name else (file.filename or "document")
    safe_name    = _sanitize(file_name)
    content_type = file.content_type or "application/octet-stream"

    try:
        supabase_admin.storage.create_bucket("documents", options={"public": True})
    except Exception as e:
        err = str(e).lower()
        if not any(k in err for k in ("already exists", "409", "duplicate", "already_exists", "violates unique")):
            raise HTTPException(status_code=500, detail=f"Storage setup failed: {e}")

    storage_path = f"{client['firm_id']}/{req.data['case_id']}/{uuid.uuid4()}_{safe_name}"
    supabase_admin.storage.from_("documents").upload(
        storage_path, file_content, file_options={"content-type": content_type}
    )
    storage_url = supabase_admin.storage.from_("documents").get_public_url(storage_path)

    doc = supabase.table("document").insert({
        "firm_id":               client["firm_id"],
        "case_id":               req.data["case_id"],
        "uploaded_by":           user["id"],
        "file_name":             file_name,
        "file_type":             _file_type(safe_name),
        "file_size_mb":          round(len(file_content) / (1024 * 1024), 4),
        "storage_url":           storage_url,
        "category":              req.data.get("category") or "CLIENT_DOC",
        "status":                "PENDING_REVIEW",
        "is_shared_with_client": True,
    }).execute()

    supabase.table("document_request").update({
        "status":               "FULFILLED",
        "fulfilled_document_id": doc.data[0]["id"],
        "fulfilled_at":         "now()",
    }).eq("id", request_id).execute()

    supabase_admin.table("notification").insert({
        "user_id": req.data["requested_by"],
        "type":    "DOCUMENT_SHARED",
        "title":   "Document Uploaded by Client",
        "message": f"The client uploaded: {file_name}",
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id":      req.data["case_id"],
        "firm_id":      client["firm_id"],
        "action":       f"Client uploaded document: {file_name}",
        "performed_by": user["id"],
    }).execute()

    return doc.data[0]
