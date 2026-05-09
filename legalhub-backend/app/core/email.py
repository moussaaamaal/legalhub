from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


def send_event_reminder_email(to_email: str, lawyer_name: str, event_title: str, event_type: str, start_datetime: str, minutes_before: int):
    """Send a calendar event reminder email to a lawyer."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping reminder email.")
        return

    type_labels = {
        "HEARING": "Court Hearing", "MEETING": "Meeting",
        "DEADLINE": "Deadline", "CONSULTATION": "Consultation", "COURT_DATE": "Court Date",
    }
    type_label = type_labels.get(event_type, event_type)

    if minutes_before < 60:
        time_label = f"{minutes_before} minutes"
    elif minutes_before == 60:
        time_label = "1 hour"
    else:
        time_label = f"{minutes_before // 60} hours" if minutes_before < 1440 else "1 day"

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;
                border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="background: #1E40AF; color: white; padding: 16px 24px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin:0;">⏰ Event Reminder</h2>
        <p style="margin:4px 0 0; opacity:.85;">LegalHub Calendar</p>
      </div>
      <p style="color:#374151;">Hello <strong>{lawyer_name}</strong>,</p>
      <p style="color:#374151;">This is a reminder that your <strong>{type_label}</strong> starts in <strong>{time_label}</strong>.</p>
      <div style="background:#EFF6FF; border-left:4px solid #1E40AF; border-radius:8px;
                  padding:16px 20px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:18px; font-weight:700; color:#1E293B;">{event_title}</p>
        <p style="margin:0; color:#6B7280; font-size:14px;">📅 {start_datetime}</p>
      </div>
      <p style="color:#9CA3AF; font-size:12px; margin-top:24px;">
        You are receiving this reminder because you have email reminders enabled in LegalHub.
      </p>
    </div>
    """

    message = Mail(
        from_email=settings.FROM_EMAIL,
        to_emails=to_email,
        subject=f"⏰ Reminder: {event_title} in {time_label}",
        html_content=html_content,
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"[email] Reminder sent to {to_email} — HTTP {response.status_code}", flush=True)
    except Exception as e:
        body = getattr(e, 'body', None)
        print(f"[email] FAILED to send to {to_email}: {e} | body: {body}", flush=True)


def send_invoice_email(
    to_email: str,
    client_name: str,
    firm_name: str,
    lawyer_name: str,
    invoice_number: str,
    issue_date: str,
    due_date: str,
    items: list,          # [{"description": str, "quantity": float, "unit_price": float, "total": float}]
    subtotal: float,
    tax_rate: float,
    tax_amount: float,
    total_amount: float,
    currency: str = "USD",
    notes: str = "",
):
    """Send an invoice to a client by email."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping invoice email.")
        return

    symbol = {"USD": "$", "EUR": "€", "GBP": "£", "SAR": "﷼"}.get(currency, currency + " ")

    def fmt(n):
        return f"{symbol}{n:,.2f}"

    # Build line-items rows
    items_rows = "".join(
        f"""
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 8px; color:#374151;">{it['description']}</td>
          <td style="padding:10px 8px; text-align:center; color:#6B7280;">{int(it['quantity']) if it['quantity'] == int(it['quantity']) else it['quantity']}</td>
          <td style="padding:10px 8px; text-align:right; color:#6B7280;">{fmt(it['unit_price'])}</td>
          <td style="padding:10px 8px; text-align:right; font-weight:700; color:#1E293B;">{fmt(it['total'])}</td>
        </tr>
        """
        for it in items
    )

    tax_row = (
        f"""<tr>
          <td colspan="3" style="padding:6px 8px; text-align:right; color:#6B7280;">Tax ({tax_rate}%)</td>
          <td style="padding:6px 8px; text-align:right; color:#6B7280;">{fmt(tax_amount)}</td>
        </tr>"""
        if tax_amount > 0 else ""
    )

    notes_block = (
        f"""<div style="margin-top:24px; padding:14px 18px; background:#F9FAFB;
                        border-radius:8px; border-left:4px solid #0F766E;">
          <p style="margin:0 0 4px; font-weight:700; color:#374151; font-size:13px;">Notes</p>
          <p style="margin:0; color:#6B7280; font-size:13px;">{notes}</p>
        </div>"""
        if notes else ""
    )

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width:640px; margin:auto; padding:24px;
                border:1px solid #e5e7eb; border-radius:12px; background:#ffffff;">

      <!-- Header -->
      <div style="background:#0F766E; color:white; padding:20px 24px;
                  border-radius:8px; margin-bottom:24px; display:flex; justify-content:space-between;">
        <div>
          <h2 style="margin:0; font-size:22px;">Invoice</h2>
          <p  style="margin:4px 0 0; opacity:.8; font-size:13px;">{firm_name}</p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0; font-size:18px; font-weight:700;">{invoice_number}</p>
          <p style="margin:4px 0 0; opacity:.8; font-size:13px;">Due {due_date}</p>
        </div>
      </div>

      <!-- To / From -->
      <div style="display:flex; gap:32px; margin-bottom:24px;">
        <div>
          <p style="margin:0 0 4px; font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase;">Billed To</p>
          <p style="margin:0; font-weight:700; color:#1E293B;">{client_name}</p>
        </div>
        <div>
          <p style="margin:0 0 4px; font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase;">Issue Date</p>
          <p style="margin:0; color:#374151;">{issue_date}</p>
        </div>
      </div>

      <!-- Line items table -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
        <thead>
          <tr style="background:#F0FDFA;">
            <th style="padding:10px 8px; text-align:left;   font-size:12px; color:#6B7280; font-weight:700;">DESCRIPTION</th>
            <th style="padding:10px 8px; text-align:center; font-size:12px; color:#6B7280; font-weight:700;">QTY</th>
            <th style="padding:10px 8px; text-align:right;  font-size:12px; color:#6B7280; font-weight:700;">UNIT PRICE</th>
            <th style="padding:10px 8px; text-align:right;  font-size:12px; color:#6B7280; font-weight:700;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {items_rows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:10px 8px; text-align:right; color:#6B7280;">Subtotal</td>
            <td style="padding:10px 8px; text-align:right; color:#374151; font-weight:600;">{fmt(subtotal)}</td>
          </tr>
          {tax_row}
          <tr style="background:#F0FDFA;">
            <td colspan="3" style="padding:12px 8px; text-align:right; font-size:16px; font-weight:800; color:#0F766E;">Total Due</td>
            <td style="padding:12px 8px; text-align:right; font-size:18px; font-weight:800; color:#0F766E;">{fmt(total_amount)}</td>
          </tr>
        </tfoot>
      </table>

      {notes_block}

      <div style="margin-top:28px; padding-top:20px; border-top:1px solid #e5e7eb;">
        <p style="margin:0; color:#374151; font-size:13px;">
          Sent by <strong>{lawyer_name}</strong> — {firm_name}
        </p>
        <p style="margin:4px 0 0; color:#9CA3AF; font-size:12px;">
          For any questions regarding this invoice, please reply to this email or contact your lawyer directly.
        </p>
      </div>
    </div>
    """

    message = Mail(
        from_email=settings.FROM_EMAIL,
        to_emails=to_email,
        subject=f"Invoice {invoice_number} from {firm_name} — Due {due_date}",
        html_content=html_content,
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"[email] Invoice {invoice_number} sent to {to_email} — HTTP {response.status_code}")
        print(f"[email] Invoice {invoice_number} sent to {to_email} — HTTP {response.status_code}", flush=True)
    except Exception as e:
        body = getattr(e, 'body', None)
        logger.error(f"[email] FAILED invoice to {to_email}: {e} | body: {body}")
        print(f"[email] FAILED invoice to {to_email}: {e} | body: {body}", flush=True)
        raise


def send_payment_reminder_email(
    to_email: str,
    client_name: str,
    firm_name: str,
    lawyer_name: str,
    invoice_number: str,
    due_date: str,
    total_amount: float,
    currency: str = "USD",
):
    """Send a payment reminder email to a client for an overdue/pending invoice."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping reminder email.")
        return

    symbol = {"USD": "$", "EUR": "€", "GBP": "£", "SAR": "﷼"}.get(currency, currency + " ")
    amount_str = f"{symbol}{total_amount:,.2f}"

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:24px;
                border:1px solid #e5e7eb; border-radius:12px; background:#ffffff;">

      <div style="background:#D97706; color:white; padding:18px 24px;
                  border-radius:8px; margin-bottom:24px;">
        <h2 style="margin:0; font-size:20px;">⏰ Payment Reminder</h2>
        <p style="margin:4px 0 0; opacity:.85; font-size:13px;">{firm_name}</p>
      </div>

      <p style="color:#374151;">Dear <strong>{client_name}</strong>,</p>
      <p style="color:#374151;">
        This is a friendly reminder that the following invoice is awaiting payment:
      </p>

      <div style="background:#FFFBEB; border-left:4px solid #D97706; border-radius:8px;
                  padding:16px 20px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase;">Invoice</p>
        <p style="margin:0; font-size:18px; font-weight:800; color:#1E293B;">{invoice_number}</p>
        <p style="margin:8px 0 0; color:#6B7280; font-size:13px;">Due Date: <strong style="color:#D97706;">{due_date}</strong></p>
        <p style="margin:4px 0 0; font-size:22px; font-weight:900; color:#D97706;">{amount_str}</p>
      </div>

      <p style="color:#374151; font-size:13px;">
        Please arrange payment at your earliest convenience. If you have already made this payment,
        please disregard this reminder.
      </p>
      <p style="color:#374151; font-size:13px;">
        If you have any questions, feel free to reply to this email or contact us directly.
      </p>

      <div style="margin-top:28px; padding-top:16px; border-top:1px solid #e5e7eb;">
        <p style="margin:0; color:#374151; font-size:13px;">
          Sent by <strong>{lawyer_name}</strong> — {firm_name}
        </p>
      </div>
    </div>
    """

    message = Mail(
        from_email=settings.FROM_EMAIL,
        to_emails=to_email,
        subject=f"Payment Reminder: Invoice {invoice_number} — {amount_str} due {due_date}",
        html_content=html_content,
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"[email] Reminder for {invoice_number} sent to {to_email} — HTTP {response.status_code}")
        print(f"[email] Reminder for {invoice_number} sent to {to_email} — HTTP {response.status_code}", flush=True)
    except Exception as e:
        body = getattr(e, 'body', None)
        logger.error(f"[email] FAILED reminder to {to_email}: {e} | body: {body}")
        print(f"[email] FAILED reminder to {to_email}: {e} | body: {body}", flush=True)
        raise


def send_client_invite_email(to_email: str, client_name: str, firm_name: str, invite_token: str):
    """Send an invitation email to a client with their invite token."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping email send.")
        return

    invite_link = f"{settings.FRONTEND_URL}/accept-invite?token={invite_token}"

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="color: #1E40AF;">Welcome to LegalHub, {client_name}!</h2>
      <p style="color: #374151;">
        <strong>{firm_name}</strong> has invited you to access your legal portal on LegalHub.
      </p>
      <p style="color: #374151;">Use the token below to create your account:</p>
      <div style="background: #EFF6FF; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1E40AF;">{invite_token}</span>
      </div>
      <p style="color: #374151;">Or click the button below to get started:</p>
      <a href="{invite_link}"
         style="display: inline-block; background: #1E40AF; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px 0;">
        Create My Account
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
        This invitation was sent by {firm_name} via LegalHub. If you did not expect this email, you can ignore it.
      </p>
    </div>
    """

    message = Mail(
        from_email=settings.FROM_EMAIL,
        to_emails=to_email,
        subject=f"Your invitation to join {firm_name} on LegalHub",
        html_content=html_content,
    )

    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        sg.send(message)
        logger.info(f"Invite email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send invite email to {to_email}: {e}")
