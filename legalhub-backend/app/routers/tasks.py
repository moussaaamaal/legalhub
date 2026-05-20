from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.core.dependencies import get_lawyer
from app.core.database import supabase
from app.services.case_ingestion import ingest_case
from pydantic import BaseModel
from typing import Optional
from app.models.enums import CasePriority

router = APIRouter(tags=["Tasks & Notes"])

# ─── Schemas ────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    title: str
    case_id: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None   # COURT_FILING, DOC_REVIEW, CLIENT_MEETING, etc.
    priority: CasePriority = CasePriority.NORMAL
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    reminder_at: Optional[str] = None

class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[CasePriority] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    reminder_at: Optional[str] = None

class UpdateTaskStatusRequest(BaseModel):
    status: str  # PENDING | IN_PROGRESS | COMPLETED | CANCELLED

class CreateNoteRequest(BaseModel):
    case_id: str
    content: str

class UpdateNoteRequest(BaseModel):
    content: str

# ═══════════════════════════════════════════════════════
#  TASKS
# ═══════════════════════════════════════════════════════

# ─── GET /api/tasks ─────────────────────────────────────

@router.get("/api/tasks")
async def list_tasks(
    case_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: Optional[int] = None,
    current_user=Depends(get_lawyer)
):
    is_admin = current_user["role"] in ("FIRM_ADMIN", "SUPER_ADMIN")

    query = (
        supabase.table("task")
        .select("*, case_file(id, title, case_number), app_user!task_assigned_to_fkey(id, full_name), created_user:app_user!task_created_by_fkey(id, full_name)")
        .eq("firm_id", current_user["firm_id"])
    )

    if not is_admin:
        user_id = current_user["id"]
        firm_id = current_user["firm_id"]
        assigned_ids = {
            t["id"] for t in (
                supabase.table("task").select("id").eq("firm_id", firm_id).eq("assigned_to", user_id).execute()
            ).data or []
        }
        created_ids = {
            t["id"] for t in (
                supabase.table("task").select("id").eq("firm_id", firm_id).eq("created_by", user_id).execute()
            ).data or []
        }
        task_ids = list(assigned_ids | created_ids)
        if not task_ids:
            return []
        query = query.in_("id", task_ids)

    if case_id:
        query = query.eq("case_id", case_id)
    if status:
        query = query.eq("status", status)
    query = query.order("due_date")
    if limit:
        query = query.limit(limit)
    result = query.execute()
    return result.data

# ─── POST /api/tasks ────────────────────────────────────

@router.post("/api/tasks", status_code=201)
async def create_task(body: CreateTaskRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    data["firm_id"]    = current_user["firm_id"]
    data["created_by"] = current_user["id"]
    if "assigned_to" not in data:
        data["assigned_to"] = current_user["id"]

    result = supabase.table("task").insert(data).execute()

    if body.case_id:
        supabase.table("case_timeline").insert({
            "case_id":      body.case_id,
            "firm_id":      current_user["firm_id"],
            "action":       f"Task created: {body.title}",
            "performed_by": current_user["id"],
        }).execute()
        background_tasks.add_task(ingest_case, body.case_id, current_user["firm_id"])

    assigned_to = data.get("assigned_to", current_user["id"])
    due_suffix  = f" — Due: {body.due_date}" if body.due_date else ""
    supabase.table("notification").insert({
        "user_id": assigned_to,
        "type":    "TASK_ASSIGNED",
        "title":   "New Task Assigned" if assigned_to != current_user["id"] else "Task Created",
        "message": f"{body.title}{due_suffix}",
    }).execute()

    return result.data[0]

# ─── PATCH /api/tasks/:id/status ────────────────────────

@router.patch("/api/tasks/{task_id}/status")
async def update_task_status(task_id: str, body: UpdateTaskStatusRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    result = (
        supabase.table("task")
        .update({"status": body.status})
        .eq("id", task_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    if case_id := result.data[0].get("case_id"):
        background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
    return result.data[0]

# ─── PUT /api/tasks/:id ─────────────────────────────────

@router.put("/api/tasks/{task_id}")
async def update_task(task_id: str, body: UpdateTaskRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("task")
        .update(data)
        .eq("id", task_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    if case_id := result.data[0].get("case_id"):
        background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
    return result.data[0]

# ─── DELETE /api/tasks/:id ──────────────────────────────

@router.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    task = supabase.table("task").select("title, case_id") \
        .eq("id", task_id).eq("firm_id", current_user["firm_id"]).maybe_single().execute()
    task_data = task.data or {}
    case_id   = task_data.get("case_id")
    title     = task_data.get("title") or "Task"

    supabase.table("task").delete().eq("id", task_id).eq("firm_id", current_user["firm_id"]).execute()

    if case_id:
        try:
            supabase.table("case_timeline").insert({
                "case_id":      case_id,
                "firm_id":      current_user["firm_id"],
                "action":       f'Task deleted: "{title}"',
                "performed_by": current_user["id"],
            }).execute()
        except Exception:
            pass
        background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])

    return {"message": "Task deleted"}

# ═══════════════════════════════════════════════════════
#  NOTES
# ═══════════════════════════════════════════════════════

# ─── GET /api/notes ─────────────────────────────────────

@router.get("/api/notes")
async def list_notes(
    case_id: Optional[str] = None,
    current_user=Depends(get_lawyer)
):
    query = (
        supabase.table("note")
        .select("*, app_user!note_lawyer_id_fkey(id, full_name, avatar_url)")
        .eq("firm_id", current_user["firm_id"])
    )
    if case_id:
        query = query.eq("case_id", case_id)
    result = query.order("created_at", desc=True).execute()
    return result.data

# ─── POST /api/notes ────────────────────────────────────

@router.post("/api/notes", status_code=201)
async def create_note(body: CreateNoteRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    result = supabase.table("note").insert({
        "firm_id":   current_user["firm_id"],
        "case_id":   body.case_id,
        "lawyer_id": current_user["id"],
        "content":   body.content,
    }).execute()

    supabase.table("case_timeline").insert({
        "case_id":      body.case_id,
        "firm_id":      current_user["firm_id"],
        "action":       "Note added",
        "performed_by": current_user["id"],
    }).execute()
    if body.case_id:
        background_tasks.add_task(ingest_case, body.case_id, current_user["firm_id"])

    return result.data[0]

# ─── PUT /api/notes/:id ─────────────────────────────────

@router.put("/api/notes/{note_id}")
async def update_note(note_id: str, body: UpdateNoteRequest, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    result = (
        supabase.table("note")
        .update({"content": body.content})
        .eq("id", note_id)
        .eq("firm_id", current_user["firm_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Note not found")
    if case_id := result.data[0].get("case_id"):
        background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])
    return result.data[0]

# ─── DELETE /api/notes/:id ──────────────────────────────

@router.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, background_tasks: BackgroundTasks, current_user=Depends(get_lawyer)):
    note = supabase.table("note").select("case_id, content") \
        .eq("id", note_id).eq("firm_id", current_user["firm_id"]).maybe_single().execute()
    note_data = note.data or {}
    case_id   = note_data.get("case_id")
    content   = (note_data.get("content") or "")[:60]
    snippet   = content + ("…" if len(note_data.get("content") or "") > 60 else "")

    supabase.table("note").delete().eq("id", note_id).eq("firm_id", current_user["firm_id"]).execute()

    if case_id:
        try:
            supabase.table("case_timeline").insert({
                "case_id":      case_id,
                "firm_id":      current_user["firm_id"],
                "action":       f'Note deleted: "{snippet}"',
                "performed_by": current_user["id"],
            }).execute()
        except Exception:
            pass
        background_tasks.add_task(ingest_case, case_id, current_user["firm_id"])

    return {"message": "Note deleted"}
