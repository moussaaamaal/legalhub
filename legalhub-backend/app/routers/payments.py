import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.dependencies import get_current_user
from app.core.database import supabase
from app.core.config import settings
from pydantic import BaseModel

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payments", tags=["Payments"])

# ─── Schemas ────────────────────────────────────────────

from typing import Optional

class StripePaymentRequest(BaseModel):
    invoice_id:  str
    currency:    str = "usd"
    card_number: Optional[str] = None
    card_name:   Optional[str] = None
    exp_month:   Optional[str] = None
    exp_year:    Optional[str] = None
    cvc:         Optional[str] = None

class SadadPaymentRequest(BaseModel):
    invoice_id: str

class SaveMethodRequest(BaseModel):
    card_number: str
    card_name:   str
    exp_month:   str
    exp_year:    str
    cvc:         str

class PayWithMethodRequest(BaseModel):
    invoice_id:       str
    payment_method_id: str
    currency:         str = "usd"

# ─── Helpers ────────────────────────────────────────────

def _get_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe

def _get_or_create_stripe_customer(stripe_lib, user_id: str, email: str) -> str:
    """Find existing Stripe customer by metadata or create a new one."""
    existing = stripe_lib.Customer.search(query=f'metadata["lh_user_id"]:"{user_id}"', limit=1)
    if existing.data:
        return existing.data[0]["id"]
    customer = stripe_lib.Customer.create(email=email, metadata={"lh_user_id": user_id})
    return customer["id"]


def _mark_invoice_paid(invoice_id: str, gateway: str, transaction_id: str):
    supabase.table("invoice").update({
        "status":  "PAID",
        "paid_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", invoice_id).execute()

    invoice = supabase.table("invoice").select("client_id, total_amount, currency").eq("id", invoice_id).maybe_single().execute()
    if invoice and invoice.data:
        supabase.table("payment").insert({
            "invoice_id":             invoice_id,
            "client_id":              invoice.data["client_id"],
            "amount":                 invoice.data["total_amount"],
            "currency":               invoice.data["currency"],
            "gateway":                gateway,
            "gateway_transaction_id": transaction_id,
            "status":                 "COMPLETED",
            "paid_at":                datetime.now(timezone.utc).isoformat(),
        }).execute()

# ─── POST /api/payments/stripe/create ───────────────────

@router.post("/stripe/create")
async def create_stripe_payment(body: StripePaymentRequest, current_user=Depends(get_current_user)):
    invoice = (
        supabase.table("invoice")
        .select("*")
        .eq("id", body.invoice_id)
        .maybe_single()
        .execute()
    )
    if not invoice or not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = invoice.data
    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Invoice already paid")

    stripe_lib = _get_stripe()
    amount_cents = int(float(inv["total_amount"]) * 100)

    # If card details are provided, tokenize + confirm in one step
    if body.card_number and body.exp_month and body.exp_year and body.cvc:
        try:
            exp_year = int(body.exp_year)
            if exp_year < 100:
                exp_year += 2000

            pm = stripe_lib.PaymentMethod.create(
                type="card",
                card={
                    "number":    body.card_number.replace(" ", ""),
                    "exp_month": int(body.exp_month),
                    "exp_year":  exp_year,
                    "cvc":       body.cvc,
                },
            )

            payment_intent = stripe_lib.PaymentIntent.create(
                amount=amount_cents,
                currency=body.currency.lower(),
                payment_method=pm["id"],
                confirm=True,
                metadata={"invoice_id": body.invoice_id, "firm_id": inv.get("firm_id", "")},
            )

            if payment_intent["status"] == "succeeded":
                _mark_invoice_paid(body.invoice_id, "STRIPE", payment_intent["id"])
                return {"status": "succeeded", "message": "Payment successful"}

            raise HTTPException(status_code=400, detail=f"Payment status: {payment_intent['status']}")

        except stripe_lib.error.CardError as e:
            raise HTTPException(status_code=400, detail=e.user_message or str(e))
        except stripe_lib.error.StripeError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # No card details — return client_secret for SDK-based confirmation
    payment_intent = stripe_lib.PaymentIntent.create(
        amount=amount_cents,
        currency=body.currency.lower(),
        metadata={"invoice_id": body.invoice_id, "firm_id": inv.get("firm_id", "")},
    )
    return {
        "client_secret":      payment_intent["client_secret"],
        "payment_intent_id":  payment_intent["id"],
        "amount":             inv["total_amount"],
        "currency":           body.currency,
    }

# ─── POST /api/payments/stripe/confirm ──────────────────

@router.post("/stripe/confirm")
async def confirm_stripe_payment(payment_intent_id: str, current_user=Depends(get_current_user)):
    stripe = _get_stripe()
    intent = stripe.PaymentIntent.retrieve(payment_intent_id)

    if intent["status"] != "succeeded":
        raise HTTPException(status_code=400, detail=f"Payment not succeeded: {intent['status']}")

    invoice_id = intent["metadata"].get("invoice_id")
    if invoice_id:
        _mark_invoice_paid(invoice_id, "STRIPE", payment_intent_id)

    return {"message": "Payment confirmed", "status": intent["status"]}

# ─── GET /api/payments/stripe/methods ──────────────────

@router.get("/stripe/methods")
async def list_saved_methods(current_user=Depends(get_current_user)):
    stripe_lib = _get_stripe()
    try:
        customer_id = _get_or_create_stripe_customer(
            stripe_lib, current_user["id"], current_user.get("email", "")
        )
        methods = stripe_lib.PaymentMethod.list(customer=customer_id, type="card")
        return [
            {
                "id":        pm["id"],
                "brand":     pm["card"]["brand"],
                "last4":     pm["card"]["last4"],
                "exp_month": pm["card"]["exp_month"],
                "exp_year":  pm["card"]["exp_year"],
            }
            for pm in (methods.data or [])
        ]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── POST /api/payments/stripe/methods/save ─────────────

@router.post("/stripe/methods/save", status_code=201)
async def save_payment_method(body: SaveMethodRequest, current_user=Depends(get_current_user)):
    stripe_lib = _get_stripe()
    try:
        exp_year = int(body.exp_year)
        if exp_year < 100:
            exp_year += 2000

        pm = stripe_lib.PaymentMethod.create(
            type="card",
            card={
                "number":    body.card_number.replace(" ", ""),
                "exp_month": int(body.exp_month),
                "exp_year":  exp_year,
                "cvc":       body.cvc,
            },
            billing_details={"name": body.card_name},
        )
        customer_id = _get_or_create_stripe_customer(
            stripe_lib, current_user["id"], current_user.get("email", "")
        )
        stripe_lib.PaymentMethod.attach(pm["id"], customer=customer_id)
        return {
            "id":        pm["id"],
            "brand":     pm["card"]["brand"],
            "last4":     pm["card"]["last4"],
            "exp_month": pm["card"]["exp_month"],
            "exp_year":  pm["card"]["exp_year"],
        }
    except stripe_lib.error.CardError as e:
        raise HTTPException(status_code=400, detail=e.user_message or str(e))
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── DELETE /api/payments/stripe/methods/{method_id} ────

@router.delete("/stripe/methods/{method_id}")
async def delete_saved_method(method_id: str, current_user=Depends(get_current_user)):
    stripe_lib = _get_stripe()
    try:
        stripe_lib.PaymentMethod.detach(method_id)
        return {"message": "Payment method removed"}
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── POST /api/payments/stripe/pay-with-method ──────────

@router.post("/stripe/pay-with-method")
async def pay_with_saved_method(body: PayWithMethodRequest, current_user=Depends(get_current_user)):
    invoice = (
        supabase.table("invoice")
        .select("*")
        .eq("id", body.invoice_id)
        .maybe_single()
        .execute()
    )
    if not invoice or not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv = invoice.data
    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Invoice already paid")

    stripe_lib = _get_stripe()
    try:
        customer_id = _get_or_create_stripe_customer(
            stripe_lib, current_user["id"], current_user.get("email", "")
        )
        amount_cents = int(float(inv["total_amount"]) * 100)
        intent = stripe_lib.PaymentIntent.create(
            amount=amount_cents,
            currency=body.currency.lower(),
            customer=customer_id,
            payment_method=body.payment_method_id,
            confirm=True,
            off_session=True,
            metadata={"invoice_id": body.invoice_id, "firm_id": inv.get("firm_id", "")},
        )
        if intent["status"] == "succeeded":
            _mark_invoice_paid(body.invoice_id, "STRIPE", intent["id"])
            return {"status": "succeeded", "message": "Payment successful"}
        raise HTTPException(status_code=400, detail=f"Payment status: {intent['status']}")
    except stripe_lib.error.CardError as e:
        raise HTTPException(status_code=400, detail=e.user_message or str(e))
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── POST /api/payments/sadad/initiate ──────────────────

@router.post("/sadad/initiate")
async def initiate_sadad_payment(body: SadadPaymentRequest, current_user=Depends(get_current_user)):
    invoice = (
        supabase.table("invoice")
        .select("*")
        .eq("id", body.invoice_id)
        .single()
        .execute()
    )
    if not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = invoice.data
    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Invoice already paid")

    bill_reference = inv["invoice_number"]

    if not settings.SADAD_API_KEY or not settings.SADAD_MERCHANT_ID:
        _log.warning("[sadad] Credentials not configured — returning reference only")
        return {
            "bill_reference": bill_reference,
            "amount":         inv["total_amount"],
            "currency":       inv["currency"],
            "instructions":   (
                f"Use reference '{bill_reference}' to pay SAR {inv['total_amount']:.2f} "
                "through your bank's SADAD service."
            ),
        }

    # ── Real Sadad API call ──────────────────────────────
    import requests as _req
    headers = {
        "Authorization": f"Bearer {settings.SADAD_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "merchantId":    settings.SADAD_MERCHANT_ID,
        "billNumber":    bill_reference,
        "amount":        float(inv["total_amount"]),
        "currency":      "SAR",
        "description":   f"Invoice {bill_reference} — LegalHub",
    }
    try:
        resp = _req.post(
            f"{settings.SADAD_API_URL}/bills/register",
            json=payload, headers=headers, timeout=15,
        )
        resp.raise_for_status()
        sadad_data = resp.json()
        return {
            "bill_reference":  sadad_data.get("billNumber", bill_reference),
            "sadad_reference": sadad_data.get("sadadReference"),
            "amount":          inv["total_amount"],
            "currency":        "SAR",
            "instructions":    (
                f"Bill registered with SADAD. Use reference '{bill_reference}' "
                "in your bank's SADAD portal to complete payment."
            ),
        }
    except _req.exceptions.RequestException as e:
        _log.error(f"[sadad] API call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Sadad API error: {e}")

# ─── POST /api/payments/webhook ─────────────────────────

@router.post("/webhook")
async def payment_webhook(request: Request):
    """Handle incoming webhooks from Stripe and Sadad."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if sig_header and settings.STRIPE_WEBHOOK_SECRET:
        stripe = _get_stripe()
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")

        if event["type"] == "payment_intent.succeeded":
            intent = event["data"]["object"]
            invoice_id = intent["metadata"].get("invoice_id")
            if invoice_id:
                _mark_invoice_paid(invoice_id, "STRIPE", intent["id"])

        return {"received": True}

    # Sadad webhook (structure varies by provider — adapt as needed)
    try:
        data = await request.json()
        invoice_number = data.get("billNumber") or data.get("bill_number")
        transaction_id = data.get("transactionId") or data.get("transaction_id")
        status = data.get("status", "").upper()

        if status == "PAID" and invoice_number:
            invoice = (
                supabase.table("invoice")
                .select("id")
                .eq("invoice_number", invoice_number)
                .single()
                .execute()
            )
            if invoice.data:
                _mark_invoice_paid(invoice.data["id"], "SADAD", transaction_id or invoice_number)
    except Exception:
        pass

    return {"received": True}
