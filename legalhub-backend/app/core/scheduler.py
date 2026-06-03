"""
Background scheduler — sends calendar event reminder emails and task due-date reminders.
Calendar job: runs every minute, checks events starting in 30 min / 1 h / 1 day.
Task job: runs every hour, sends an in-app notification 1 day before a task's due_date
          only when the assigned user has task_reminders enabled in their profile.
Duplicate sends are prevented with in-memory sets (resets on server restart,
which is fine for a short-lived dev/PFE setup).
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.core.database import supabase
from app.core.email import send_event_reminder_email

DISPLAY_TZ = ZoneInfo(os.getenv("DISPLAY_TZ", "Africa/Tunis"))

logger = logging.getLogger(__name__)

# (event_id, offset_minutes) — avoids sending the same reminder twice
_sent: set = set()

# task_id — avoids sending the same task reminder twice
_task_sent: set = set()

# Reminder windows to check (minutes before event)
REMINDER_OFFSETS = [30, 60, 1440]   # 30 min, 1 h, 1 day


def _check_and_send_reminders():
    try:
        now       = datetime.now(timezone.utc)
        now_local = now.astimezone(DISPLAY_TZ)
        print(f"[scheduler] tick at {now_local.strftime('%H:%M:%S')} {DISPLAY_TZ.key}", flush=True)

        for offset in REMINDER_OFFSETS:
            target     = now + timedelta(minutes=offset)
            window_lo  = (target - timedelta(minutes=1)).isoformat()
            window_hi  = (target + timedelta(minutes=1)).isoformat()

            # Log windows in local time for readability
            lo_local = (target - timedelta(minutes=1)).astimezone(DISPLAY_TZ).strftime("%H:%M")
            hi_local = (target + timedelta(minutes=1)).astimezone(DISPLAY_TZ).strftime("%H:%M")

            result = (
                supabase.table("calendar_event")
                .select("id, title, event_type, start_datetime, created_by, firm_id")
                .gte("start_datetime", window_lo)
                .lte("start_datetime", window_hi)
                .execute()
            )
            events = result.data or []
            print(f"[scheduler] offset={offset}min → window [{lo_local} – {hi_local}] (local) → {len(events)} event(s)", flush=True)

            for ev in events:
                key = (ev["id"], offset)
                if key in _sent:
                    print(f"[scheduler] already sent for event={ev['id']} offset={offset}", flush=True)
                    continue

                # Fetch the lawyer who created the event
                user_res = (
                    supabase.table("app_user")
                    .select("email, full_name")
                    .eq("id", ev["created_by"])
                    .execute()
                )
                user_data = user_res.data[0] if user_res.data else None
                if not user_data:
                    print(f"[scheduler] user not found for created_by={ev['created_by']}", flush=True)
                    continue

                email = user_data.get("email")
                name  = user_data.get("full_name", "Lawyer")

                if not email:
                    continue

                # Display the time exactly as stored (no timezone conversion)
                try:
                    dt = datetime.fromisoformat(ev["start_datetime"].replace("Z", "+00:00"))
                    dt_display = dt.strftime("%A %d %B %Y at %H:%M")
                except Exception:
                    dt_display = ev["start_datetime"]

                print(f"[scheduler] sending reminder to {email} for '{ev['title']}' in {offset}min", flush=True)
                send_event_reminder_email(
                    to_email=email,
                    lawyer_name=name,
                    event_title=ev["title"],
                    event_type=ev.get("event_type", ""),
                    start_datetime=dt_display,
                    minutes_before=offset,
                )
                _sent.add(key)

    except Exception as e:
        print(f"[scheduler] ERROR: {e}", flush=True)
        logger.error(f"Reminder scheduler error: {e}")


def _check_task_due_reminders():
    """Send an in-app notification 1 day before a task's due_date if task_reminders is enabled."""
    try:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        print(f"[scheduler] task-reminder check — due_date={tomorrow}", flush=True)

        result = (
            supabase.table("task")
            .select("id, title, due_date, assigned_to")
            .eq("due_date", tomorrow)
            .not_.in_("status", ["COMPLETED", "CANCELLED"])
            .execute()
        )
        tasks = result.data or []
        print(f"[scheduler] {len(tasks)} task(s) due tomorrow", flush=True)

        for task in tasks:
            task_id = task["id"]
            if task_id in _task_sent:
                continue

            user_id = task.get("assigned_to")
            if not user_id:
                continue

            # Check notification_preferences — default to True if row absent
            pref_res = (
                supabase.table("notification_preferences")
                .select("task_reminders")
                .eq("user_id", user_id)
                .execute()
            )
            if pref_res.data:
                enabled = pref_res.data[0].get("task_reminders", True)
            else:
                enabled = True

            if not enabled:
                print(f"[scheduler] task_reminders disabled for user={user_id}, skipping task={task_id}", flush=True)
                continue

            supabase.table("notification").insert({
                "user_id": user_id,
                "type":    "TASK_ASSIGNED",
                "title":   "Task Due Tomorrow",
                "message": f"{task['title']} — Due: {task['due_date']}",
            }).execute()

            _task_sent.add(task_id)
            print(f"[scheduler] task reminder sent — task={task_id} user={user_id}", flush=True)

    except Exception as e:
        print(f"[scheduler] task-reminder ERROR: {e}", flush=True)
        logger.error(f"Task reminder scheduler error: {e}")


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _check_and_send_reminders,
        trigger=IntervalTrigger(minutes=1),
        id="reminder_job",
        replace_existing=True,
    )
    scheduler.add_job(
        _check_task_due_reminders,
        trigger=IntervalTrigger(hours=1),
        id="task_reminder_job",
        replace_existing=True,
    )
    scheduler.start()
    print("[scheduler] Reminder scheduler started - calendar: every minute, tasks: every hour", flush=True)
    return scheduler
