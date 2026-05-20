import logging
import requests as _req
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer
from app.core.database import supabase
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp"])

WHATSAPP_API_BASE = "https://graph.facebook.com/v19.0"


class SendMessageRequest(BaseModel):
    to_phone:    str
    message:     str
    template:    Optional[str] = None


class SendInvoiceNotifRequest(BaseModel):
    invoice_id: str


def _normalize_phone(phone: str) -> str:
    """Normalize phone number to E.164 format without leading +.
    Handles: +213..., 00213..., 0... (assumes DZ prefix 213 as fallback).
    """
    import re
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) <= 10:
        # Local format — prepend Algerian country code as default fallback
        digits = "213" + digits[1:]
    return digits


def _send_whatsapp_template(to_phone: str, template_name: str = "hello_world", lang: str = "en_US") -> dict:
    """Send a WhatsApp template message (always delivered, no 24h restriction)."""
    if not settings.WHATSAPP_API_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
        raise HTTPException(status_code=503, detail="WhatsApp not configured")

    normalized = _normalize_phone(to_phone)
    url = f"{WHATSAPP_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to":   normalized,
        "type": "template",
        "template": {"name": template_name, "language": {"code": lang}},
    }
    resp = _req.post(url, json=payload, headers=headers, timeout=15)
    _log.info(f"[whatsapp/template:{template_name}] {resp.status_code} → {to_phone}")
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"WhatsApp template error: {resp.text}")
    data = resp.json()
    if "error" in data:
        raise HTTPException(status_code=502, detail=f"WhatsApp template error: {data['error']}")
    return data


def _send_whatsapp_text(to_phone: str, message: str) -> dict:
    """Send a plain text WhatsApp message via Meta Cloud API."""
    if not settings.WHATSAPP_API_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
        raise HTTPException(
            status_code=503,
            detail=(
                "WhatsApp not configured. Set WHATSAPP_API_TOKEN and "
                "WHATSAPP_PHONE_NUMBER_ID in your .env file."
            ),
        )

    normalized = _normalize_phone(to_phone)
    _log.info(f"[whatsapp] sending to {normalized} (raw: {to_phone})")

    url = f"{WHATSAPP_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to":   normalized,
        "type": "text",
        "text": {"body": message},
    }
    resp = _req.post(url, json=payload, headers=headers, timeout=15)

    _log.info(f"[whatsapp] Meta response {resp.status_code}: {resp.text}")

    if not resp.ok:
        _log.error(f"[whatsapp] send failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=502, detail=f"WhatsApp API error: {resp.text}")

    # Meta sometimes embeds errors in a 200 response
    data = resp.json()
    if "error" in data:
        err = data["error"]
        _log.error(f"[whatsapp] Meta error in 200 body: {err}")
        raise HTTPException(
            status_code=502,
            detail=f"WhatsApp error {err.get('code')}: {err.get('message')}",
        )

    return data


# ─── GET /api/whatsapp/templates ────────────────────────────────────────────

@router.get("/templates")
async def list_templates(current_user=Depends(get_lawyer)):
    """Liste tous les templates Meta et leur statut (APPROVED, PENDING, REJECTED)."""
    if not settings.WHATSAPP_API_TOKEN:
        raise HTTPException(status_code=503, detail="WhatsApp not configured")

    # L'ID du compte WhatsApp Business est différent du phone number ID
    # On récupère d'abord le WABA ID via le phone number ID
    phone_info = _req.get(
        f"{WHATSAPP_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}",
        headers={"Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}"},
        timeout=10,
    )
    waba_id = None
    if phone_info.ok:
        waba_id = phone_info.json().get("whatsapp_business_account_id")

    if not waba_id:
        raise HTTPException(status_code=502, detail=f"Could not get WABA ID: {phone_info.text}")

    resp = _req.get(
        f"{WHATSAPP_API_BASE}/{waba_id}/message_templates",
        headers={"Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}"},
        params={"fields": "name,status,language,components"},
        timeout=10,
    )
    if not resp.ok:
        raise HTTPException(status_code=502, detail=resp.text)

    templates = resp.json().get("data", [])
    return [
        {"name": t["name"], "status": t["status"], "language": t.get("language")}
        for t in templates
    ]


# ─── POST /api/whatsapp/test-template ───────────────────────────────────────

@router.post("/test-template")
async def test_template(body: dict, current_user=Depends(get_lawyer)):
    """Envoie le template hello_world pour tester la livraison Meta."""
    to_phone = body.get("to_phone", "")
    if not to_phone:
        raise HTTPException(status_code=400, detail="to_phone required")

    if not settings.WHATSAPP_API_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
        raise HTTPException(status_code=503, detail="WhatsApp not configured")

    normalized = _normalize_phone(to_phone)
    url = f"{WHATSAPP_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to":   normalized,
        "type": "template",
        "template": {
            "name":     "hello_world",
            "language": {"code": "en_US"},
        },
    }
    resp = _req.post(url, json=payload, headers=headers, timeout=15)
    _log.info(f"[whatsapp/test-template] {resp.status_code}: {resp.text}")
    return {"status": resp.status_code, "meta_response": resp.json()}


# ─── POST /api/whatsapp/send ─────────────────────────────────────────────────

@router.post("/send")
async def send_whatsapp_message(body: SendMessageRequest, current_user=Depends(get_lawyer)):
    result = _send_whatsapp_text(body.to_phone, body.message)
    return {"message": "WhatsApp message sent", "whatsapp_response": result}


# ─── POST /api/whatsapp/send-invoice-notif ───────────────────────────────────

@router.post("/send-invoice-notif")
async def send_invoice_whatsapp(body: SendInvoiceNotifRequest, current_user=Depends(get_lawyer)):
    inv_res = (
        supabase.table("invoice")
        .select("*, invoice_item(*), client(first_name, last_name, phone), case_file(title)")
        .eq("id", body.invoice_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv    = inv_res.data
    client = inv.get("client") or {}
    phone  = client.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Client has no phone number on file")

    normalized    = _normalize_phone(phone)
    client_name   = f"{client.get('first_name','')} {client.get('last_name','')}".strip() or "Client"
    amount_str    = f"{inv.get('currency','USD')} {float(inv.get('total_amount',0)):,.2f}"
    due_date_str  = str(inv.get('due_date', '—'))
    case_title    = (inv.get("case_file") or {}).get("title") or "N/A"
    lawyer_name   = current_user.get("full_name") or current_user.get("email", "Your Attorney")

    url = f"{WHATSAPP_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
        "Content-Type":  "application/json",
    }

    custom_payload = {
        "messaging_product": "whatsapp",
        "to":   normalized,
        "type": "template",
        "template": {
            "name":     "legalhub_invoice",
            "language": {"code": "en"},
            "components": [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": client_name},
                    {"type": "text", "text": inv["invoice_number"]},
                    {"type": "text", "text": amount_str},
                    {"type": "text", "text": due_date_str},
                    {"type": "text", "text": case_title},
                    {"type": "text", "text": lawyer_name},
                ],
            }],
        },
    }

    resp = _req.post(url, json=custom_payload, headers=headers, timeout=15)
    resp_data = resp.json()
    _log.info(f"[send_invoice_notif] legalhub_invoice → {resp.status_code}: {resp.text}")

    if resp.ok and "error" not in resp_data:
        _log.info(f"[send_invoice_notif] ✅ Custom template sent to {phone}")
        return {"message": f"Invoice notification sent to {phone}", "template": "invoice_notification"}

    # Log exact Meta error so we can diagnose
    meta_error = resp_data.get("error", {})
    _log.warning(
        f"[send_invoice_notif] legalhub_invoice failed — "
        f"status={resp.status_code} code={meta_error.get('code')} "
        f"subcode={meta_error.get('error_subcode')} msg={meta_error.get('message')} "
        f"payload_sent={custom_payload['template']}"
    )
    _send_whatsapp_template(phone, template_name="hello_world", lang="en_US")

    # Texte détaillé si fenêtre 24h ouverte
    detail_msg = (
        f"Hello {client_name},\n\n"
        f"You have a new invoice from your legal team:\n"
        f"📄 Invoice: {inv['invoice_number']}\n"
        f"💰 Amount: {amount_str}\n"
        f"📅 Due Date: {due_date_str}\n"
        f"⚖️  Case: {case_title}\n"
        f"👨‍💼 Attorney: {lawyer_name}\n\n"
        f"Please open the LegalHub app to view and pay your invoice."
    )
    try:
        _send_whatsapp_text(phone, detail_msg)
    except Exception as e:
        _log.warning(f"[send_invoice_notif] detail text skipped: {e}")

    return {"message": f"Invoice notification sent to {phone}", "template": "hello_world (fallback)"}


# ─── POST /api/whatsapp/send-event-reminder ──────────────────────────────────

@router.post("/send-event-reminder")
async def send_event_whatsapp_reminder(event_id: str, current_user=Depends(get_lawyer)):
    ev_res = (
        supabase.table("calendar_event")
        .select("*, case_file(client_id, title)")
        .eq("id", event_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not ev_res.data:
        raise HTTPException(status_code=404, detail="Event not found")

    ev = ev_res.data
    case = ev.get("case_file") or {}
    client_id = case.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="Event is not linked to a case with a client")

    client_res = supabase.table("client").select("first_name, last_name, phone").eq("id", client_id).single().execute()
    if not client_res.data:
        raise HTTPException(status_code=404, detail="Client not found")

    client = client_res.data
    phone  = client.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Client has no phone number on file")

    client_name = f"{client.get('first_name','')} {client.get('last_name','')}".strip() or "Client"

    # 1️⃣ Template — garanti
    _send_whatsapp_template(phone)
    _log.info(f"[send_event_reminder] template sent to {phone}")

    # 2️⃣ Détails — si fenêtre 24h ouverte
    detail_msg = (
        f"📅 Rappel de rendez-vous :\n"
        f"• {ev.get('title','Appointment')}\n"
        f"• Type : {ev.get('event_type','')}\n"
        f"• Quand : {ev.get('start_datetime','—')}\n"
        + (f"• Lieu : {ev['location']}\n" if ev.get('location') else "")
        + (f"• Lien vidéo : {ev['video_call_url']}\n" if ev.get('video_call_url') else "")
        + f"\nDossier : {case.get('title','')}"
    )
    try:
        _send_whatsapp_text(phone, detail_msg)
    except Exception as e:
        _log.warning(f"[send_event_reminder] detail text skipped (24h window): {e}")

    return {"message": f"Event reminder sent to {phone}", "template_sent": True}
