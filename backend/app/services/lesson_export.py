"""Geração de PDF/Word do Plano de Trabalho Docente (PTD) para entrega à
coordenação. Usa bibliotecas puramente Python (sem dependências de sistema
como Cairo/Pango), compatíveis com o deploy no Render."""

import io

from docx import Document
from docx.shared import Pt
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


SECTIONS = [
    ("ementa", "Ementa"),
    ("objetivos", "Objetivos"),
    ("conteudo_programatico", "Conteúdo Programático"),
    ("metodologia", "Metodologia"),
    ("recursos_didaticos", "Recursos Didáticos"),
    ("criterios_avaliacao", "Critérios de Avaliação"),
    ("bibliografia", "Bibliografia"),
    ("notes", "Observações"),
]


def _field(plan, key: str) -> str:
    if plan is None:
        return ""
    value = getattr(plan, key, None) if not isinstance(plan, dict) else plan.get(key)
    return (value or "").strip()


def render_lesson_plan_docx(discipline_name: str, plan) -> io.BytesIO:
    document = Document()
    title = document.add_heading("Plano de Trabalho Docente (PTD)", level=1)
    title.runs[0].font.size = Pt(18)
    document.add_heading(discipline_name, level=2)

    for key, label in SECTIONS:
        content = _field(plan, key)
        if not content:
            continue
        document.add_heading(label, level=3)
        for paragraph in content.split("\n"):
            document.add_paragraph(paragraph)

    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)
    return buffer


def render_lesson_plan_pdf(discipline_name: str, plan) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Plano de Trabalho Docente (PTD)", styles["Title"]),
        Paragraph(discipline_name, styles["Heading2"]),
        Spacer(1, 0.5 * cm),
    ]
    for key, label in SECTIONS:
        content = _field(plan, key)
        if not content:
            continue
        story.append(Paragraph(label, styles["Heading3"]))
        for paragraph in content.split("\n"):
            if paragraph.strip():
                story.append(Paragraph(paragraph, styles["BodyText"]))
        story.append(Spacer(1, 0.3 * cm))

    doc.build(story)
    buffer.seek(0)
    return buffer
