from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer, get_current_user
from app.core.database import supabase
from app.core.email import send_invoice_email, send_payment_reminder_email
from pydantic import BaseModel
from typing import Optional, List
from app.models.enums import InvoiceStatus
import secrets

router = APIRouter(prefix="/api/invoices", tags=["Billing"])

# ─── Helpers ────────────────────────────────────────────

def _auto_mark_overdue(firm_id: str) -> None:
    """Promote any PENDING invoice whose due_date has passed to OVERDUE."""
    today = date.today().isoformat()
    overdue_ids = (
        supabase.table("invoice")
        .select("id")
        .eq("firm_id", firm_id)
        .eq("status", "PENDING")
        .lt("due_date", today)
        .execute()
    )
    ids = [r["id"] for r in (overdue_ids.data or [])]
    if ids:
        supabase.table("invoice").update({"status": "OVERDUE"}).in_("id", ids).execute()

# ─── Schemas ────────────────────────────────────────────

class InvoiceItem(BaseModel):
    description: str
    quantity: float
    unit_price: float

class CreateInvoiceRequest(BaseModel):
    client_id: str
    case_id: Optional[str] = None
    items: List[InvoiceItem]
    tax_rate: float = 0
    due_date: date
    currency: str = "USD"
    notes: Optional[str] = None

class UpdateInvoiceRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    items: Optional[List[InvoiceItem]] = None
    tax_rate: Optional[float] = None
    due_date: Optional[date] = None
    currency: Optional[str] = None
    notes: Optional[str] = None

# ─── GET /api/invoices/analytics/summary ────────────────
# IMPORTANT: Must be declared BEFORE /{invoice_id} to avoid
# FastAPI interpreting "analytics" as an invoice_id path param.

@router.get("/analytics/summary")
async def billing_analytics(current_user=Depends(get_lawyer)):
    _auto_mark_overdue(current_user["firm_id"])
    invoices = (
        supabase.table("invoice")
        .select("*")
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    data = invoices.data or []

    total_revenue   = sum(i["total_amount"] for i in data if i["status"] == "PAID")
    outstanding     = sum(i["total_amount"] for i in data if i["status"] == "PENDING")
    overdue         = sum(i["total_amount"] for i in data if i["status"] == "OVERDUE")
    total_invoices  = len(data)
    paid_count      = len([i for i in data if i["status"] == "PAID"])
    collection_rate = round((paid_count / total_invoices * 100) if total_invoices > 0 else 0, 1)

    return {
        "total_revenue": total_revenue,
        "outstanding": outstanding,
        "overdue": overdue,
        "total_invoices": total_invoices,
        "collection_rate": collection_rate,
    }

# ─── GET /api/invoices ──────────────────────────────────

@router.get("")
async def list_invoices(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    case_id: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    _auto_mark_overdue(current_user["firm_id"])
    query = (
        supabase.table("invoice")
        .select("*, invoice_item(*), client(id, first_name, last_name, email)")
        .eq("firm_id", current_user["firm_id"])
    )
    if current_user["role"] == "CLIENT":
        client_result = (
            supabase.table("client")
            .select("id")
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not client_result.data:
            return []
        query = query.eq("client_id", client_result.data["id"])
    if status:
        query = query.eq("status", status)
    if client_id:
        query = query.eq("client_id", client_id)
    if case_id:
        query = query.eq("case_id", case_id)

    result = query.order("created_at", desc=True).execute()
    return result.data

# ─── POST /api/invoices ─────────────────────────────────

@router.post("", status_code=201)
async def create_invoice(body: CreateInvoiceRequest, current_user=Depends(get_lawyer)):
    subtotal   = sum(item.quantity * item.unit_price for item in body.items)
    tax_amount = subtotal * (body.tax_rate / 100)
    total      = subtotal + tax_amount

    invoice_number = f"INV-{secrets.token_hex(3).upper()}"

    data = {
        "firm_id":        current_user["firm_id"],
        "lawyer_id":      current_user["id"],
        "client_id":      body.client_id,
        "case_id":        body.case_id,
        "invoice_number": invoice_number,
        "status":         InvoiceStatus.DRAFT,
        "subtotal":       subtotal,
        "tax_rate":       body.tax_rate,
        "tax_amount":     tax_amount,
        "total_amount":   total,
        "currency":       body.currency,
        "issue_date":     date.today().isoformat(),
        "due_date":       body.due_date.isoformat(),
        "notes":          body.notes,
    }

    invoice = supabase.table("invoice").insert(data).execute()
    invoice_id = invoice.data[0]["id"]

    for item in body.items:
        supabase.table("invoice_item").insert({
            "invoice_id":  invoice_id,
            "description": item.description,
            "quantity":    item.quantity,
            "unit_price":  item.unit_price,
            "total":       item.quantity * item.unit_price,
        }).execute()

    supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    "INVOICE_DUE",
        "title":   "Invoice Created",
        "message": f"{invoice_number} — {body.currency} {total:,.2f} due {body.due_date}.",
    }).execute()

    return invoice.data[0]

# ─── GET /api/invoices/:id ──────────────────────────────

@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, current_user=Depends(get_current_user)):
    result = (
        supabase.table("invoice")
        .select("*, invoice_item(*), client(id, first_name, last_name, email)")
        .eq("id", invoice_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return result.data

# ─── PUT /api/invoices/:id ──────────────────────────────

@router.put("/{invoice_id}")
async def update_invoice(invoice_id: str, body: UpdateInvoiceRequest, current_user=Depends(get_lawyer)):
    # Fetch current invoice to verify ownership
    existing = (
        supabase.table("invoice")
        .select("id, status")
        .eq("id", invoice_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if existing.data["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Cannot edit a paid invoice")

    update_data: dict = {}

    if body.items is not None:
        subtotal   = sum(item.quantity * item.unit_price for item in body.items)
        tax_rate   = body.tax_rate if body.tax_rate is not None else 0
        tax_amount = subtotal * (tax_rate / 100)
        update_data.update({
            "subtotal":     subtotal,
            "tax_rate":     tax_rate,
            "tax_amount":   tax_amount,
            "total_amount": subtotal + tax_amount,
        })
        # Replace line items
        supabase.table("invoice_item").delete().eq("invoice_id", invoice_id).execute()
        for item in body.items:
            supabase.table("invoice_item").insert({
                "invoice_id":  invoice_id,
                "description": item.description,
                "quantity":    item.quantity,
                "unit_price":  item.unit_price,
                "total":       item.quantity * item.unit_price,
            }).execute()

    for field in ("client_id", "case_id", "currency", "notes"):
        val = getattr(body, field)
        if val is not None:
            update_data[field] = val
    if body.due_date is not None:
        update_data["due_date"] = body.due_date.isoformat()

    if update_data:
        result = (
            supabase.table("invoice")
            .update(update_data)
            .eq("id", invoice_id)
            .execute()
        )
        return result.data[0]

    return existing.data

# ─── POST /api/invoices/:id/send ────────────────────────

@router.post("/{invoice_id}/send")
async def send_invoice(invoice_id: str, current_user=Depends(get_lawyer)):
    # Fetch invoice with items and client email in one query
    inv_res = (
        supabase.table("invoice")
        .select("*, invoice_item(*), client(id, first_name, last_name, email)")
        .eq("id", invoice_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv    = inv_res.data
    client = inv.get("client") or {}

    client_email = client.get("email")
    if not client_email:
        raise HTTPException(status_code=400, detail="Client has no email address on file")

    client_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Client"

    # Fetch firm name
    firm_res  = supabase.table("firm").select("name").eq("id", current_user["firm_id"]).single().execute()
    firm_name = firm_res.data.get("name", "LegalHub") if firm_res.data else "LegalHub"

    # Send the email (raises on hard failure)
    lawyer_name = current_user.get("full_name") or current_user.get("email", "Your lawyer")

    try:
        send_invoice_email(
            to_email       = client_email,
            client_name    = client_name,
            firm_name      = firm_name,
            lawyer_name    = lawyer_name,
            invoice_number = inv["invoice_number"],
            issue_date     = str(inv.get("issue_date", "")),
            due_date       = str(inv.get("due_date",   "")),
            items          = inv.get("invoice_item", []),
            subtotal       = float(inv.get("subtotal",     0)),
            tax_rate       = float(inv.get("tax_rate",     0)),
            tax_amount     = float(inv.get("tax_amount",   0)),
            total_amount   = float(inv.get("total_amount", 0)),
            currency       = inv.get("currency", "USD"),
            notes          = inv.get("notes") or "",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {e}")

    # Mark as PENDING only after successful send
    supabase.table("invoice").update({
        "status": InvoiceStatus.PENDING
    }).eq("id", invoice_id).execute()

    supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    "INVOICE_DUE",
        "title":   "Invoice Sent",
        "message": f"{inv['invoice_number']} sent to {client_name} — due {inv.get('due_date', '')}.",
    }).execute()

    return {"message": f"Invoice sent to {client_email}"}

# ─── POST /api/invoices/:id/reminder ────────────────────

@router.post("/{invoice_id}/reminder")
async def send_reminder(invoice_id: str, current_user=Depends(get_lawyer)):
    inv_res = (
        supabase.table("invoice")
        .select("*, client(id, first_name, last_name, email)")
        .eq("id", invoice_id)
        .eq("firm_id", current_user["firm_id"])
        .single()
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv    = inv_res.data
    client = inv.get("client") or {}

    client_email = client.get("email")
    if not client_email:
        raise HTTPException(status_code=400, detail="Client has no email address on file")

    client_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Client"
    firm_res    = supabase.table("firm").select("name").eq("id", current_user["firm_id"]).single().execute()
    firm_name   = firm_res.data.get("name", "LegalHub") if firm_res.data else "LegalHub"
    lawyer_name = current_user.get("full_name") or current_user.get("email", "Your lawyer")

    due_date_str = str(inv.get("due_date", "")) if inv.get("due_date") else "—"

    try:
        send_payment_reminder_email(
            to_email       = client_email,
            client_name    = client_name,
            firm_name      = firm_name,
            lawyer_name    = lawyer_name,
            invoice_number = inv["invoice_number"],
            due_date       = due_date_str,
            total_amount   = float(inv.get("total_amount", 0)),
            currency       = inv.get("currency", "USD"),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {e}")

    return {"message": f"Payment reminder sent to {client_email}"}
