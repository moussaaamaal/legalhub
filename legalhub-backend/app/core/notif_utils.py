"""
Notification insertion helper that respects user notification preferences.

Maps each notification type to its preference field in notification_preferences.
If the user has no preference row, the notification is sent (default enabled).
"""

from app.core.database import supabase_admin

# Maps notification type → preference column name (None = always send)
_TYPE_TO_PREF: dict[str, str | None] = {
    "TASK_ASSIGNED":    "task_reminders",
    "HEARING_REMINDER": "hearing_reminders",
    "DOCUMENT_SHARED":  "document_updates",
    "DOCUMENT_REQUEST": "document_updates",
    "INVOICE_DUE":      "payment_notifications",
    "MEETING_REQUEST":  "client_messages",
    "CASE_UPDATE":      None,
    "GENERAL":          None,
}


def _pref_allowed(user_id: str, notif_type: str) -> bool:
    """Return True if the user's preferences allow this notification type."""
    pref_key = _TYPE_TO_PREF.get(notif_type)
    if pref_key is None:
        return True
    try:
        res = (
            supabase_admin.table("notification_preferences")
            .select(pref_key)
            .eq("user_id", user_id)
            .execute()
        )
        if res.data:
            return bool(res.data[0].get(pref_key, True))
    except Exception:
        pass
    return True  # default to sending when preferences row is absent or DB error


def insert_notification(
    sb,
    user_id: str,
    notif_type: str,
    title: str,
    message: str | None = None,
) -> bool:
    """
    Insert a notification only when the user's preferences allow it.

    sb          — supabase or supabase_admin client to use for the insert
    user_id     — recipient user id
    notif_type  — one of the VALID_TYPES (TASK_ASSIGNED, INVOICE_DUE, …)
    title       — notification title
    message     — optional body text

    Returns True if the notification was inserted, False if blocked by preferences.
    """
    if not _pref_allowed(user_id, notif_type):
        return False
    sb.table("notification").insert({
        "user_id": user_id,
        "type":    notif_type,
        "title":   title,
        "message": message,
    }).execute()
    return True
