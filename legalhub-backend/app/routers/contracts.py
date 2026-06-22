"""
Contract Drafting Router — /api/contracts

Workflow:
  POST /session/start    → Choose contract type, AI generates questions
  POST /session/answer   → Answer questions, advance questionnaire
  POST /generate         → Generate contract text via RAG + Mistral
  POST /{id}/risks       → Analyze contract risks
  GET  /{id}             → Get draft details
  GET  /                 → List drafts for current user
  POST /{id}/export-pdf  → Export to PDF, save to Supabase Storage
"""

import io
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.database import supabase, supabase_admin
from app.core.dependencies import get_lawyer
from app.routers.ai import _mistral_chat
from app.services.contract_rag_service import retrieve_legal_context, build_rag_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/contracts", tags=["Contracts"])


# ─── Contract type registry ───────────────────────────────────────────────────

CONTRACT_TYPES = {
    "bail":               {"ar": "عقد إيجار",          "fr": "Contrat de bail",               "en": "Lease Agreement"},
    "travail_cdi":        {"ar": "عقد عمل دائم",        "fr": "Contrat de travail CDI",         "en": "Employment Contract (CDI)"},
    "travail_cdd":        {"ar": "عقد عمل محدد المدة",  "fr": "Contrat de travail CDD",         "en": "Fixed-term Employment Contract"},
    "prestation_service": {"ar": "عقد خدمات",           "fr": "Contrat de prestation de services","en": "Service Agreement"},
    "nda":                {"ar": "اتفاقية سرية",         "fr": "Accord de confidentialité",      "en": "NDA"},
    "vente":              {"ar": "عقد بيع",              "fr": "Contrat de vente",               "en": "Sale Agreement"},
    "societe":            {"ar": "عقد تأسيس شركة",       "fr": "Statuts de société",             "en": "Company Formation"},
    "pret":               {"ar": "عقد قرض",              "fr": "Contrat de prêt",                "en": "Loan Agreement"},
    "partenariat":        {"ar": "عقد شراكة",            "fr": "Contrat de partenariat",         "en": "Partnership Agreement"},
    "franchise":          {"ar": "عقد امتياز",           "fr": "Contrat de franchise",           "en": "Franchise Agreement"},
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SessionStartRequest(BaseModel):
    contract_type: str          # one of CONTRACT_TYPES keys
    lang: str = "ar"            # ar | fr | en
    country_code: str = "TN"    # ISO country code
    case_id: Optional[str] = None

class SessionAnswerRequest(BaseModel):
    session_id: str
    answers: dict               # { "question_key": "answer_value" }

class GenerateRequest(BaseModel):
    session_id: str

class RisksRequest(BaseModel):
    session_id: Optional[str] = None
    contract_text: Optional[str] = None   # direct analysis without session

class ExportPdfRequest(BaseModel):
    session_id: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_draft(session_id: str, firm_id: str) -> dict:
    res = supabase_admin.table("contract_draft") \
        .select("*") \
        .eq("id", session_id) \
        .eq("firm_id", firm_id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Contract draft not found")
    return res.data


def _lang_label(lang: str, contract_type: str) -> str:
    labels = CONTRACT_TYPES.get(contract_type, {})
    return labels.get(lang, labels.get("fr", contract_type))


def _system_prompt(lang: str) -> str:
    if lang == "ar":
        return (
            "أنت محامٍ متخصص في صياغة العقود القانونية. "
            "تكتب بأسلوب قانوني دقيق ومهني. تستجيب دائماً بالعربية الفصحى."
        )
    if lang == "fr":
        return (
            "Vous êtes un avocat expert en rédaction de contrats juridiques. "
            "Vous répondez toujours en français juridique précis et professionnel."
        )
    return (
        "You are a lawyer expert in drafting legal contracts. "
        "You always respond in clear, professional legal English."
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/types")
async def list_contract_types():
    """Return available contract types with multilingual labels."""
    return [
        {"key": k, "labels": v}
        for k, v in CONTRACT_TYPES.items()
    ]


@router.post("/session/start")
async def start_session(body: SessionStartRequest, current_user=Depends(get_lawyer)):
    """
    Start a contract drafting session.
    Returns session_id + first set of questions from the AI.
    """
    if body.contract_type not in CONTRACT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown contract type. Available: {list(CONTRACT_TYPES.keys())}"
        )

    contract_label = _lang_label(body.lang, body.contract_type)

    # AI generates the first questions
    questions_text = await _mistral_chat(
        messages=[
            {"role": "system", "content": _system_prompt(body.lang)},
            {
                "role": "user",
                "content": _build_questions_prompt(
                    contract_type=body.contract_type,
                    contract_label=contract_label,
                    lang=body.lang,
                    country_code=body.country_code,
                    existing_answers={},
                ),
            },
        ],
        max_tokens=800,
        temperature=0.1,
    )

    questions = _parse_questions(questions_text)

    # Create draft in Supabase
    draft_data = {
        "id":            str(uuid.uuid4()),
        "lawyer_id":     current_user["id"],
        "firm_id":       current_user["firm_id"],
        "contract_type": body.contract_type,
        "lang":          body.lang,
        "country_code":  body.country_code.upper(),
        "status":        "DRAFTING",
        "answers":       {},
        "questions":     questions,
    }
    if body.case_id:
        draft_data["case_id"] = body.case_id

    res = supabase_admin.table("contract_draft").insert(draft_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Could not create contract session")

    draft = res.data[0]
    return {
        "session_id":     draft["id"],
        "contract_type":  body.contract_type,
        "contract_label": contract_label,
        "lang":           body.lang,
        "country_code":   body.country_code,
        "questions":      questions,
        "status":         "DRAFTING",
    }


@router.post("/session/answer")
async def answer_questions(body: SessionAnswerRequest, current_user=Depends(get_lawyer)):
    """
    Submit answers to the current questions.
    Returns next questions if more info is needed, or 'complete: true' if ready to generate.
    """
    draft = _get_draft(body.session_id, current_user["firm_id"])

    # Merge new answers with existing
    merged_answers = {**(draft.get("answers") or {}), **body.answers}

    contract_label = _lang_label(draft["lang"], draft["contract_type"])

    # Ask AI: are we ready, or do we need more questions?
    check_text = await _mistral_chat(
        messages=[
            {"role": "system", "content": _system_prompt(draft["lang"])},
            {
                "role": "user",
                "content": _build_completeness_check_prompt(
                    contract_type=draft["contract_type"],
                    contract_label=contract_label,
                    lang=draft["lang"],
                    country_code=draft["country_code"],
                    answers=merged_answers,
                ),
            },
        ],
        max_tokens=600,
        temperature=0.1,
    )

    is_complete = _is_complete(check_text)

    next_questions = []
    if not is_complete:
        next_q_text = await _mistral_chat(
            messages=[
                {"role": "system", "content": _system_prompt(draft["lang"])},
                {
                    "role": "user",
                    "content": _build_questions_prompt(
                        contract_type=draft["contract_type"],
                        contract_label=contract_label,
                        lang=draft["lang"],
                        country_code=draft["country_code"],
                        existing_answers=merged_answers,
                    ),
                },
            ],
            max_tokens=600,
            temperature=0.1,
        )
        next_questions = _parse_questions(next_q_text)

    # Update draft
    supabase_admin.table("contract_draft").update({
        "answers":   merged_answers,
        "questions": next_questions,
        "status":    "READY" if is_complete else "DRAFTING",
    }).eq("id", body.session_id).execute()

    return {
        "session_id": body.session_id,
        "complete":   is_complete,
        "questions":  next_questions,
        "answers_so_far": merged_answers,
    }


@router.post("/generate")
async def generate_contract(body: GenerateRequest, current_user=Depends(get_lawyer)):
    """
    Generate the full contract text using RAG + Mistral.
    Must be called after the questionnaire is complete.
    """
    draft = _get_draft(body.session_id, current_user["firm_id"])
    answers = draft.get("answers") or {}
    lang = draft["lang"]
    contract_type = draft["contract_type"]
    country_code = draft["country_code"]

    # Retrieve legal context from Milvus RAG
    chunks = await retrieve_legal_context(
        contract_type=contract_type,
        answers=answers,
        lang=lang,
        country_code=country_code,
        top_k=8,
    )
    rag_context = build_rag_context(chunks, max_chars=5000)
    contract_label = _lang_label(lang, contract_type)

    # Build the generation prompt
    answers_formatted = "\n".join([f"- {k}: {v}" for k, v in answers.items()])

    rag_section = (
        f"\n\n## Références juridiques récupérées (RAG):\n{rag_context}"
        if rag_context else ""
    )

    if lang == "ar":
        prompt = (
            f"اكتب {contract_label} كاملاً ومفصلاً وفق القانون في {country_code}.\n\n"
            f"## المعلومات المجمعة:\n{answers_formatted}"
            f"{rag_section}\n\n"
            "اكتب العقد كاملاً بالعربية الفصحى، مع جميع البنود القانونية اللازمة، "
            "ومراعاة الأحكام القانونية المعمول بها في الدولة المحددة. "
            "ابدأ مباشرة بنص العقد."
        )
    elif lang == "fr":
        prompt = (
            f"Rédigez un {contract_label} complet et détaillé conforme au droit de {country_code}.\n\n"
            f"## Informations collectées:\n{answers_formatted}"
            f"{rag_section}\n\n"
            "Rédigez le contrat complet en français juridique avec toutes les clauses "
            "nécessaires conformes à la législation applicable. "
            "Commencez directement par le texte du contrat."
        )
    else:
        prompt = (
            f"Draft a complete {contract_label} compliant with the law of {country_code}.\n\n"
            f"## Collected Information:\n{answers_formatted}"
            f"{rag_section}\n\n"
            "Write the full contract in professional legal English with all necessary clauses. "
            "Start directly with the contract text."
        )

    contract_text = await _mistral_chat(
        messages=[
            {"role": "system", "content": _system_prompt(lang)},
            {"role": "user",   "content": prompt},
        ],
        max_tokens=4000,
        temperature=0.2,
    )

    # Save generated text
    supabase_admin.table("contract_draft").update({
        "generated_text": contract_text,
        "status":         "REVIEW",
        "rag_sources":    [c.get("source", "") for c in chunks[:5]],
    }).eq("id", body.session_id).execute()

    # Log in ai_session for usage tracking
    try:
        row = {
            "lawyer_id":    current_user["id"],
            "firm_id":      current_user["firm_id"],
            "prompt":       f"Generate {contract_type} contract",
            "output":       contract_text[:2000],
            "session_type": "CONTRACT_DRAFT",
        }
        if draft.get("case_id"):
            row["case_id"] = draft["case_id"]
        supabase.table("ai_session").insert(row).execute()
    except Exception as e:
        logger.warning(f"ai_session insert failed: {e}")

    return {
        "session_id":    body.session_id,
        "contract_text": contract_text,
        "rag_sources":   [c.get("source", "") for c in chunks[:5]],
        "status":        "REVIEW",
    }


@router.post("/{session_id}/risks")
async def analyze_risks(session_id: str, current_user=Depends(get_lawyer)):
    """
    Analyze the generated contract for risks, missing clauses, and recommendations.
    """
    draft = _get_draft(session_id, current_user["firm_id"])
    contract_text = draft.get("generated_text", "")

    if not contract_text:
        raise HTTPException(status_code=400, detail="Contract not generated yet. Call /generate first.")

    lang = draft["lang"]

    if lang == "ar":
        prompt = (
            f"حلل هذا العقد القانوني وحدد المخاطر والثغرات والتوصيات:\n\n"
            f"{contract_text[:8000]}\n\n"
            "قدم تقريراً مفصلاً يشمل:\n"
            "## 1. المخاطر القانونية\n(كل خطر مع مستوى: عالي/متوسط/منخفض)\n"
            "## 2. البنود الناقصة\n(ما الذي يجب إضافته)\n"
            "## 3. البنود الغامضة\n(ما يحتاج توضيحاً)\n"
            "## 4. التوصيات\n(اقتراحات التحسين)\n"
            "## 5. التقييم العام\n(نقاط من 10 مع التعليل)"
        )
    elif lang == "fr":
        prompt = (
            f"Analysez ce contrat juridique et identifiez les risques, lacunes et recommandations:\n\n"
            f"{contract_text[:8000]}\n\n"
            "Fournissez un rapport détaillé avec:\n"
            "## 1. Risques juridiques\n(chaque risque avec niveau: élevé/moyen/faible)\n"
            "## 2. Clauses manquantes\n(ce qui doit être ajouté)\n"
            "## 3. Clauses ambiguës\n(ce qui nécessite clarification)\n"
            "## 4. Recommandations\n(suggestions d'amélioration)\n"
            "## 5. Évaluation globale\n(note /10 avec justification)"
        )
    else:
        prompt = (
            f"Analyze this legal contract for risks, gaps, and recommendations:\n\n"
            f"{contract_text[:8000]}\n\n"
            "Provide a detailed report with:\n"
            "## 1. Legal Risks\n(each risk with level: high/medium/low)\n"
            "## 2. Missing Clauses\n(what should be added)\n"
            "## 3. Ambiguous Clauses\n(what needs clarification)\n"
            "## 4. Recommendations\n(improvement suggestions)\n"
            "## 5. Overall Assessment\n(score /10 with reasoning)"
        )

    risk_analysis = await _mistral_chat(
        messages=[
            {
                "role": "system",
                "content": (
                    _system_prompt(lang) +
                    " You specialize in contract risk analysis and legal advisory."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=2000,
        temperature=0.1,
    )

    supabase_admin.table("contract_draft").update({
        "risk_analysis": risk_analysis,
        "status":        "FINALIZED",
    }).eq("id", session_id).execute()

    return {
        "session_id":    session_id,
        "risk_analysis": risk_analysis,
        "status":        "FINALIZED",
    }


@router.post("/{session_id}/export-pdf")
async def export_pdf(session_id: str, current_user=Depends(get_lawyer)):
    """
    Generate a PDF of the contract and upload to Supabase Storage.
    Returns a signed URL valid for 1 hour.
    """
    draft = _get_draft(session_id, current_user["firm_id"])
    contract_text = draft.get("generated_text", "")

    if not contract_text:
        raise HTTPException(status_code=400, detail="Contract not generated yet.")

    lang = draft["lang"]
    contract_label = _lang_label(lang, draft["contract_type"])
    country_code = draft.get("country_code", "")

    # Generate PDF with reportlab
    pdf_bytes = _build_pdf(
        title=contract_label,
        content=contract_text,
        lang=lang,
        country=country_code,
    )

    # Upload to Supabase Storage
    file_name = f"contracts/{current_user['firm_id']}/{session_id}.pdf"
    try:
        supabase_admin.storage.from_("documents").upload(
            path=file_name,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        signed = supabase_admin.storage.from_("documents").create_signed_url(
            path=file_name, expires_in=3600
        )
        pdf_url = signed.get("signedURL") or signed.get("signed_url") or ""
    except Exception as e:
        logger.error(f"PDF upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF upload failed: {e}")

    supabase_admin.table("contract_draft").update({
        "pdf_url": pdf_url,
        "status":  "FINALIZED",
    }).eq("id", session_id).execute()

    return {
        "session_id": session_id,
        "pdf_url":    pdf_url,
        "file_name":  file_name,
    }


@router.get("/{session_id}")
async def get_draft(session_id: str, current_user=Depends(get_lawyer)):
    """Get a single contract draft."""
    draft = _get_draft(session_id, current_user["firm_id"])
    return draft


@router.get("/")
async def list_drafts(current_user=Depends(get_lawyer)):
    """List all contract drafts for the current user's firm."""
    res = supabase_admin.table("contract_draft") \
        .select("id, contract_type, lang, country_code, status, created_at, pdf_url") \
        .eq("firm_id", current_user["firm_id"]) \
        .order("created_at", desc=True) \
        .limit(50).execute()
    return res.data or []


# ─── PDF generation ───────────────────────────────────────────────────────────

# Arabic-supporting font paths (tried in order)
_ARABIC_FONT_PATHS = [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/calibri.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]
_REGISTERED_FONT = None


def _get_arabic_font() -> str:
    """Register an Arabic-supporting font once, return its name."""
    global _REGISTERED_FONT
    if _REGISTERED_FONT:
        return _REGISTERED_FONT

    import os
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    for path in _ARABIC_FONT_PATHS:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("LHArabic", path))
                _REGISTERED_FONT = "LHArabic"
                logger.info(f"PDF: registered Arabic font from {path}")
                return _REGISTERED_FONT
            except Exception as e:
                logger.warning(f"PDF: font registration failed for {path}: {e}")

    logger.warning("PDF: no Arabic font found, falling back to Helvetica")
    _REGISTERED_FONT = "Helvetica"
    return _REGISTERED_FONT


def _prepare_text(text: str, lang: str) -> str:
    """
    Reshape Arabic text for correct display in PDF, and strip markdown markers.
    Also escapes XML special chars for ReportLab's Paragraph parser.
    """
    import re
    from xml.sax.saxutils import escape

    # Strip all markdown markers first
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text, flags=re.DOTALL)  # **bold**
    text = re.sub(r'\*(.+?)\*',     r'\1', text, flags=re.DOTALL)  # *italic*
    text = re.sub(r'`(.+?)`',       r'\1', text)                   # `code`
    text = text.strip()

    if not text:
        return ""

    # Arabic reshaping
    if lang == "ar":
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display
            text = get_display(arabic_reshaper.reshape(text))
        except ImportError:
            pass  # proceed without reshaping — at least font will show chars

    # Escape XML special characters for ReportLab
    text = escape(text)
    return text


def _is_table_row(line: str) -> bool:
    t = line.strip()
    return t.startswith("|") and t.endswith("|") and len(t) > 2


def _build_pdf(title: str, content: str, lang: str, country: str) -> bytes:
    """Build a properly formatted legal contract PDF with Arabic support."""
    import re
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
    )
    from reportlab.lib import colors

    font = _get_arabic_font()
    buf = io.BytesIO()
    is_rtl = lang == "ar"

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
    )

    styles = getSampleStyleSheet()

    def _style(name, base="Normal", **kw):
        kw.setdefault("fontName", font)
        return ParagraphStyle(name, parent=styles[base], **kw)

    title_style = _style("CT", base="Heading1", fontSize=15, spaceAfter=4,
                         alignment=TA_CENTER, textColor=colors.HexColor("#1a2744"))
    sub_style   = _style("CS", fontSize=9, spaceAfter=10, alignment=TA_CENTER,
                         textColor=colors.grey)
    body_style  = _style("CB", fontSize=10, leading=17, spaceAfter=6,
                         alignment=TA_RIGHT if is_rtl else TA_JUSTIFY)
    head_style  = _style("CH", base="Heading2", fontSize=11, spaceBefore=10,
                         spaceAfter=4, textColor=colors.HexColor("#1a2744"),
                         alignment=TA_RIGHT if is_rtl else TA_LEFT)
    foot_style  = _style("CF", fontSize=8, textColor=colors.grey, alignment=TA_CENTER)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph(_prepare_text(title, lang), title_style))
    story.append(Paragraph(f"{country} | LegalHub", sub_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a2744")))
    story.append(Spacer(1, 0.4 * cm))

    # ── Content ─────────────────────────────────────────────────────────────
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        raw = lines[i]

        # ── Table block ──────────────────────────────────────────────────
        if _is_table_row(raw):
            table_lines = []
            while i < len(lines) and _is_table_row(lines[i]):
                table_lines.append(lines[i])
                i += 1

            # Parse: row[0]=header, row[1]=separator, rest=data
            def parse_row(r):
                return [c.strip() for c in r.strip().strip("|").split("|")]

            header_cells = parse_row(table_lines[0])
            data_rows    = [parse_row(r) for r in table_lines[2:] if table_lines[2:]]

            # Build table data
            col_count = len(header_cells)
            tdata = [
                [Paragraph(_prepare_text(c, lang), _style("TH", fontSize=9,
                    fontName=font, textColor=colors.white, alignment=TA_RIGHT if is_rtl else TA_LEFT))
                 for c in header_cells]
            ]
            for dr in data_rows:
                # Pad/trim row to match column count
                dr = (dr + [""] * col_count)[:col_count]
                tdata.append([
                    Paragraph(_prepare_text(c, lang), _style("TD", fontSize=9,
                        fontName=font, alignment=TA_RIGHT if is_rtl else TA_LEFT))
                    for c in dr
                ])

            col_width = (A4[0] - 5 * cm) / max(col_count, 1)
            tbl = Table(tdata, colWidths=[col_width] * col_count, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0),  colors.HexColor("#1a2744")),
                ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
                ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("TOPPADDING",  (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN",      (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.3 * cm))
            continue

        # ── Normal lines ─────────────────────────────────────────────────
        line = raw.strip()
        i += 1

        if not line or line in ("---", "___", "***"):
            story.append(Spacer(1, 0.2 * cm))
            continue

        if line.startswith("### ") or line.startswith("## ") or line.startswith("# "):
            heading_text = re.sub(r'^#+\s+', '', line)
            story.append(Paragraph(_prepare_text(heading_text, lang), head_style))

        elif re.match(r'^\*\*[^*]+\*\*$', line):
            # Standalone **bold line** → section heading
            heading_text = line.strip("*")
            story.append(Paragraph(_prepare_text(heading_text, lang), head_style))

        else:
            story.append(Paragraph(_prepare_text(line, lang), body_style))

    # ── Footer ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.8 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Generated by LegalHub AI — For review purposes only", foot_style))

    doc.build(story)
    return buf.getvalue()


# ─── Question generation helpers ──────────────────────────────────────────────

def _build_questions_prompt(
    contract_type: str,
    contract_label: str,
    lang: str,
    country_code: str,
    existing_answers: dict,
) -> str:
    answered = "\n".join([f"- {k}: {v}" for k, v in existing_answers.items()])
    answered_section = f"\n\nMa collectée jusqu'ici:\n{answered}" if existing_answers else ""

    if lang == "ar":
        return (
            f"أنا أريد صياغة {contract_label} وفق قانون {country_code}."
            f"{answered_section}\n\n"
            "ما هي المعلومات الضرورية التي لا تزال ناقصة لإتمام هذا العقد؟\n"
            "اذكر 3 إلى 5 أسئلة فقط، كل سؤال في سطر منفصل، يبدأ بشرطة (-).\n"
            "لا تكرر المعلومات التي تم جمعها بالفعل.\n"
            "لا تضف شرحاً، فقط الأسئلة."
        )
    if lang == "fr":
        return (
            f"Je veux rédiger un {contract_label} conforme au droit de {country_code}."
            f"{answered_section}\n\n"
            "Quelles informations essentielles manquent encore pour compléter ce contrat?\n"
            "Listez 3 à 5 questions uniquement, une par ligne, commençant par un tiret (-).\n"
            "Ne répétez pas les informations déjà collectées.\n"
            "Pas d'explication, seulement les questions."
        )
    return (
        f"I want to draft a {contract_label} compliant with the law of {country_code}."
        f"{answered_section}\n\n"
        "What essential information is still missing to complete this contract?\n"
        "List 3 to 5 questions only, one per line, starting with a dash (-).\n"
        "Do not repeat already collected information.\n"
        "No explanation, only questions."
    )


def _build_completeness_check_prompt(
    contract_type: str,
    contract_label: str,
    lang: str,
    country_code: str,
    answers: dict,
) -> str:
    answered = "\n".join([f"- {k}: {v}" for k, v in answers.items()])

    if lang == "ar":
        return (
            f"لإتمام {contract_label} وفق قانون {country_code}، "
            f"هل المعلومات التالية كافية لصياغة عقد كامل؟\n\n{answered}\n\n"
            "أجب فقط بـ: OUI أو NON"
        )
    if lang == "fr":
        return (
            f"Pour rédiger un {contract_label} conforme au droit de {country_code}, "
            f"les informations suivantes sont-elles suffisantes pour un contrat complet?\n\n{answered}\n\n"
            "Répondez uniquement: OUI ou NON"
        )
    return (
        f"To draft a {contract_label} compliant with the law of {country_code}, "
        f"are the following details sufficient for a complete contract?\n\n{answered}\n\n"
        "Answer only: YES or NO"
    )


def _parse_questions(text: str) -> list[str]:
    """Extract question list from Mistral response."""
    questions = []
    for line in text.strip().split("\n"):
        line = line.strip()
        # Accept lines starting with -, •, *, numbers, or Arabic bullets
        if line and (
            line.startswith("-") or
            line.startswith("•") or
            line.startswith("*") or
            line[0].isdigit() or
            line.startswith("–")
        ):
            q = line.lstrip("-•*–0123456789.). ").strip()
            if len(q) > 5:
                questions.append(q)
    # Fallback: return all non-empty lines if none matched
    if not questions:
        questions = [l.strip() for l in text.strip().split("\n") if len(l.strip()) > 10]
    return questions[:6]  # max 6 questions per round


def _is_complete(text: str) -> bool:
    """Check if the completeness check response says YES."""
    t = text.strip().upper()
    return "OUI" in t or "YES" in t or t.startswith("O")
