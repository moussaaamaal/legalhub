from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_lawyer
from app.core.database import supabase
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/ai", tags=["AI"])

class SummarizeRequest(BaseModel):
    document_id: str

class DraftContractRequest(BaseModel):
    template_type: str
    parameters: dict
    case_id: Optional[str] = None

class CaseAssistantRequest(BaseModel):
    case_id: Optional[str] = None
    question: str

class SuggestActionsRequest(BaseModel):
    case_id: str

def get_openai_client():
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    from openai import OpenAI
    return OpenAI(api_key=settings.OPENAI_API_KEY)

@router.post("/summarize")
async def summarize_document(body: SummarizeRequest, current_user=Depends(get_lawyer)):
    doc = supabase.table("document").select("*").eq("id", body.document_id).single().execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found")

    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"Summarize this legal document titled '{doc.data['file_name']}'. Extract key clauses, parties, dates, and obligations. Return a structured summary."
        }]
    )
    summary = response.choices[0].message.content

    supabase.table("ai_summary").insert({
        "document_id": body.document_id,
        "summary": summary,
        "lawyer_id": current_user["id"],
    }).execute()

    return {"summary": summary}

@router.post("/draft-contract")
async def draft_contract(body: DraftContractRequest, current_user=Depends(get_lawyer)):
    client = get_openai_client()
    params_str = "\n".join([f"- {k}: {v}" for k, v in body.parameters.items()])

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "system",
            "content": "You are an expert legal assistant. Draft professional legal contracts."
        }, {
            "role": "user",
            "content": f"Draft a {body.template_type} contract with these parameters:\n{params_str}\n\nReturn a complete, professional legal contract."
        }],
        max_tokens=3000
    )
    contract = response.choices[0].message.content

    session = supabase.table("ai_session").insert({
        "lawyer_id": current_user["id"],
        "firm_id": current_user["firm_id"],
        "case_id": body.case_id,
        "prompt": f"Draft {body.template_type} contract",
        "output": contract,
        "session_type": "CONTRACT_DRAFT",
    }).execute()

    return {"contract": contract, "session_id": session.data[0]["id"]}

@router.post("/suggest-actions")
async def suggest_actions(body: SuggestActionsRequest, current_user=Depends(get_lawyer)):
    case = supabase.table("case_file").select("*").eq("id", body.case_id).single().execute()
    if not case.data:
        raise HTTPException(status_code=404, detail="Case not found")

    c = case.data
    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "system",
            "content": "You are an expert legal advisor. Suggest the next procedural steps for cases."
        }, {
            "role": "user",
            "content": f"Case: {c['title']}\nType: {c['case_type']}\nStatus: {c['status']}\nPriority: {c['priority']}\n\nWhat are the next 5 recommended legal steps?"
        }]
    )
    suggestions = response.choices[0].message.content
    return {"suggestions": suggestions}

@router.post("/case-assistant")
async def case_assistant(body: CaseAssistantRequest, current_user=Depends(get_lawyer)):
    openai_client = get_openai_client()

    if body.case_id:
        case = supabase.table("case_file").select("*").eq("id", body.case_id).single().execute()
        if not case.data:
            raise HTTPException(status_code=404, detail="Case not found")
        c = case.data
        system_prompt = (
            f"You are an AI legal assistant for this case:\n"
            f"Title: {c['title']}\nType: {c['case_type']}\n"
            f"Status: {c['status']}\nDescription: {c.get('description', 'N/A')}"
        )
    else:
        system_prompt = (
            "You are an expert AI legal assistant. "
            "Help lawyers with legal questions, case strategy, document drafting, "
            "research, and procedural guidance. Be concise and professional."
        )

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": body.question},
        ]
    )
    answer = response.choices[0].message.content
    return {"answer": answer}

@router.get("/history")
async def ai_history(current_user=Depends(get_lawyer)):
    result = supabase.table("ai_session").select("*").eq("lawyer_id", current_user["id"]).order("created_at", desc=True).limit(50).execute()
    return result.data