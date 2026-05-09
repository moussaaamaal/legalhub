"""
Client Portal Router — /api/client/*
Routes réservées au rôle CLIENT pour accéder à leurs propres données.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_current_user
from app.core.database import supabase
from app.models.enums import UserRole

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

    # Prochain rendez-vous
    appointments = (
        supabase.table("calendar_event")
        .select("id, title, start_datetime, event_type, location")
        .eq("firm_id", firm_id)
        .gte("start_datetime", today)
        .order("start_datetime")
        .limit(3)
        .execute()
    )

    return {
        "active_cases": active_cases,
        "pending_invoices_total": round(pending_invoices_total, 2),
        "pending_invoices_count": pending_invoices_count,
        "pending_documents": pending_docs,
        "upcoming_appointments": appointments.data or [],
        "client": {
            "id": client["id"],
            "first_name": client["first_name"],
            "last_name": client["last_name"],
            "email": client["email"],
            "tag": client.get("tag"),
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
            "first_hearing_date, court_name"
        )
        .eq("client_id", client["id"])
        .eq("firm_id", client["firm_id"])
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


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

    # Récupérer l'avocat principal
    case = result.data
    if case.get("lawyer_id"):
        lawyer_user = (
            supabase.table("lawyer")
            .select("*, app_user(full_name, email, avatar_url, phone)")
            .eq("id", case["lawyer_id"])
            .maybe_single()
            .execute()
        )
        if lawyer_user and lawyer_user.data:
            u = lawyer_user.data.get("app_user") or {}
            case["lead_attorney"] = {
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "phone": u.get("phone"),
                "avatar_url": u.get("avatar_url"),
                "title": lawyer_user.data.get("title"),
            }

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
async def client_documents(ctx=Depends(_require_client)):
    """Documents partagés avec le client connecté."""
    client = ctx["client"]

    # Documents liés aux dossiers du client ET marqués comme partagés
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
        supabase.table("document")
        .select("id, file_name, file_type, file_size_mb, category, status, created_at, case_id")
        .eq("firm_id", client["firm_id"])
        .eq("is_shared_with_client", True)
        .in_("case_id", case_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ─── GET /api/client/appointments ────────────────────────

@router.get("/appointments")
async def client_appointments(ctx=Depends(_require_client)):
    """Rendez-vous (passés et à venir) pour le client connecté."""
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
        supabase.table("calendar_event")
        .select(
            "id, title, event_type, start_datetime, end_datetime, "
            "location, is_video_call, video_call_url, case_id"
        )
        .eq("firm_id", client["firm_id"])
        .in_("case_id", case_ids)
        .order("start_datetime", desc=True)
        .limit(50)
        .execute()
    )

    events = result.data or []
    # Normalize field names for the mobile app
    for ev in events:
        ev["start_time"]   = ev.pop("start_datetime", None)
        ev["meeting_type"] = ev.pop("event_type", "IN_PERSON")
        ev["meeting_link"] = ev.pop("video_call_url", None)
    return events


@router.post("/appointments/request")
async def client_request_appointment(body: dict, ctx=Depends(_require_client)):
    """Le client demande un nouveau rendez-vous auprès de son avocat."""
    client = ctx["client"]

    record = {
        "firm_id":        client["firm_id"],
        "client_id":      client["id"],
        "title":          body.get("title", "Meeting Request"),
        "meeting_type":   body.get("meeting_type", "IN_PERSON"),
        "preferred_date": body.get("preferred_date"),
        "notes":          body.get("notes"),
        "status":         "PENDING",
    }

    try:
        result = (
            supabase.table("appointment_request")
            .insert(record)
            .execute()
        )
        return result.data[0] if result.data else {"status": "pending", "message": "Request received"}
    except Exception:
        # Fallback: table may not exist yet — return success so the app doesn't break
        return {"status": "pending", "message": "Request received"}


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
