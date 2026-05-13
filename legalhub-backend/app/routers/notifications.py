from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.dependencies import get_current_user
from app.core.database import supabase

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

VALID_TYPES = {"CASE_UPDATE", "INVOICE_DUE", "HEARING_REMINDER", "DOCUMENT_SHARED", "DOCUMENT_REQUEST", "TASK_ASSIGNED", "MEETING_REQUEST", "GENERAL"}

class CreateNotificationRequest(BaseModel):
    title: str
    message: Optional[str] = None
    type: str = "GENERAL"

@router.get("")
async def get_notifications(current_user=Depends(get_current_user)):
    result = supabase.table("notification").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).limit(50).execute()
    return result.data

@router.get("/unread-count")
async def get_unread_count(current_user=Depends(get_current_user)):
    result = supabase.table("notification").select("id", count="exact").eq("user_id", current_user["id"]).eq("is_read", False).execute()
    return {"count": result.count or 0}

@router.patch("/read-all")
async def mark_all_read(current_user=Depends(get_current_user)):
    supabase.table("notification").update({"is_read": True}).eq("user_id", current_user["id"]).execute()
    return {"message": "All notifications marked as read"}

@router.patch("/{notification_id}/read")
async def mark_one_read(notification_id: str, current_user=Depends(get_current_user)):
    result = supabase.table("notification").select("id").eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    supabase.table("notification").update({"is_read": True}).eq("id", notification_id).execute()
    return {"message": "Notification marked as read"}

@router.post("/test", status_code=201)
async def create_test_notification(body: CreateNotificationRequest, current_user=Depends(get_current_user)):
    notif_type = body.type if body.type in VALID_TYPES else "GENERAL"
    result = supabase.table("notification").insert({
        "user_id": current_user["id"],
        "type":    notif_type,
        "title":   body.title,
        "message": body.message,
    }).execute()
    return result.data[0]

