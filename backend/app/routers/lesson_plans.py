from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import ensure_owner_or_admin, get_current_user, get_discipline_or_404
from ..logging_config import get_logger
from ..models.base import Discipline, LessonAttachment, LessonPlan, LessonScript, ScheduledClass, User
from ..schemas.lesson_schemas import (
    LessonPlanRead,
    LessonPlanUpdate,
    LessonScriptRead,
    LessonScriptUpdate,
)
from ..services.lesson_export import render_lesson_plan_docx, render_lesson_plan_pdf


router = APIRouter(tags=["Planejamento de Aulas"])
logger = get_logger()

MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024  # 5MB — arquivos ficam no banco, sem storage externo
MAX_ATTACHMENTS_PER_SCRIPT = 8


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_scheduled_class_or_404(db: Session, scheduled_class_id: int) -> ScheduledClass:
    lesson = db.query(ScheduledClass).filter(ScheduledClass.id == scheduled_class_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Aula não encontrada.")
    return lesson


def _get_owned_discipline(db: Session, discipline_id: int, user: User) -> Discipline:
    discipline = get_discipline_or_404(db, discipline_id)
    ensure_owner_or_admin(discipline.owner_id, user, resource="Esta disciplina")
    return discipline


def _get_owned_scheduled_class(db: Session, scheduled_class_id: int, user: User) -> ScheduledClass:
    lesson = _get_scheduled_class_or_404(db, scheduled_class_id)
    ensure_owner_or_admin(lesson.config.owner_id, user, resource="Esta aula")
    return lesson


def _get_owned_attachment(db: Session, attachment_id: int, user: User) -> LessonAttachment:
    attachment = db.query(LessonAttachment).filter(LessonAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")
    ensure_owner_or_admin(attachment.lesson_script.scheduled_class.config.owner_id, user, resource="Este anexo")
    return attachment


def _get_or_default_plan(db: Session, discipline_id: int) -> LessonPlan | dict:
    plan = db.query(LessonPlan).filter(LessonPlan.discipline_id == discipline_id).first()
    if plan:
        return plan
    now = _now()
    return {
        "id": 0, "discipline_id": discipline_id, "created_at": now, "updated_at": now,
        "ementa": None, "objetivos": None, "conteudo_programatico": None, "metodologia": None,
        "recursos_didaticos": None, "criterios_avaliacao": None, "bibliografia": None, "notes": None,
    }


# --- PTD (por disciplina) ---
@router.get("/disciplines/{discipline_id}/lesson-plan", response_model=LessonPlanRead)
def get_lesson_plan(discipline_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_discipline(db, discipline_id, user)
    return _get_or_default_plan(db, discipline_id)


@router.put("/disciplines/{discipline_id}/lesson-plan", response_model=LessonPlanRead)
def upsert_lesson_plan(
    discipline_id: int, payload: LessonPlanUpdate,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    _get_owned_discipline(db, discipline_id, user)
    plan = db.query(LessonPlan).filter(LessonPlan.discipline_id == discipline_id).first()
    now = _now()
    if not plan:
        plan = LessonPlan(discipline_id=discipline_id, created_at=now, updated_at=now)
        db.add(plan)
    for key, value in payload.model_dump().items():
        setattr(plan, key, value)
    plan.owner_id = user.id
    plan.updated_at = now
    db.commit()
    db.refresh(plan)
    logger.info(f"PTD atualizado: disciplina={discipline_id}", extra={"event": "lesson_plan_updated", "actor_id": user.id, "outcome": "success"})
    return plan


@router.get("/disciplines/{discipline_id}/lesson-plan/export.docx")
def export_lesson_plan_docx(discipline_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    discipline = _get_owned_discipline(db, discipline_id, user)
    plan = db.query(LessonPlan).filter(LessonPlan.discipline_id == discipline_id).first()
    buffer = render_lesson_plan_docx(discipline.name, plan)
    filename = f"PTD_{discipline.code}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/disciplines/{discipline_id}/lesson-plan/export.pdf")
def export_lesson_plan_pdf(discipline_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    discipline = _get_owned_discipline(db, discipline_id, user)
    plan = db.query(LessonPlan).filter(LessonPlan.discipline_id == discipline_id).first()
    buffer = render_lesson_plan_pdf(discipline.name, plan)
    filename = f"PTD_{discipline.code}.pdf"
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Roteiro (por aula/ScheduledClass) ---
def _get_or_default_script(db: Session, scheduled_class_id: int) -> LessonScript | dict:
    script = db.query(LessonScript).filter(LessonScript.scheduled_class_id == scheduled_class_id).first()
    if script:
        return script
    now = _now()
    return {
        "id": 0, "scheduled_class_id": scheduled_class_id, "created_at": now, "updated_at": now,
        "topic": None, "content": None, "attachments": [],
    }


@router.get("/lessons/{scheduled_class_id}/script", response_model=LessonScriptRead)
def get_lesson_script(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_scheduled_class(db, scheduled_class_id, user)
    return _get_or_default_script(db, scheduled_class_id)


@router.put("/lessons/{scheduled_class_id}/script", response_model=LessonScriptRead)
def upsert_lesson_script(
    scheduled_class_id: int, payload: LessonScriptUpdate,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = db.query(LessonScript).filter(LessonScript.scheduled_class_id == scheduled_class_id).first()
    now = _now()
    if not script:
        script = LessonScript(scheduled_class_id=scheduled_class_id, created_at=now, updated_at=now)
        db.add(script)
    script.topic = payload.topic
    script.content = payload.content
    script.owner_id = user.id
    script.updated_at = now
    db.commit()
    db.refresh(script)
    return script


def _get_or_create_script(db: Session, scheduled_class_id: int, user: User) -> LessonScript:
    script = db.query(LessonScript).filter(LessonScript.scheduled_class_id == scheduled_class_id).first()
    if not script:
        now = _now()
        script = LessonScript(scheduled_class_id=scheduled_class_id, owner_id=user.id, created_at=now, updated_at=now)
        db.add(script)
        db.flush()
    return script


@router.post("/lessons/{scheduled_class_id}/script/attachments", response_model=LessonScriptRead, status_code=201)
async def upload_lesson_attachment(
    scheduled_class_id: int, file: UploadFile = File(...),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = _get_or_create_script(db, scheduled_class_id, user)

    existing_count = db.query(LessonAttachment).filter(LessonAttachment.lesson_script_id == script.id).count()
    if existing_count >= MAX_ATTACHMENTS_PER_SCRIPT:
        raise HTTPException(status_code=422, detail=f"Limite de {MAX_ATTACHMENTS_PER_SCRIPT} anexos por aula atingido.")

    content = await file.read()
    if len(content) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=413, detail="Arquivo maior que 5MB. Reduza o tamanho e tente novamente.")
    if not content:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")

    db.add(LessonAttachment(
        lesson_script_id=script.id, filename=file.filename or "arquivo",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content), data=content, uploaded_at=_now(),
    ))
    db.commit()
    db.refresh(script)
    logger.info(
        f"Anexo enviado: aula={scheduled_class_id} arquivo={file.filename} tamanho={len(content)}",
        extra={"event": "lesson_attachment_uploaded", "actor_id": user.id, "outcome": "success"},
    )
    return script


@router.get("/lesson-attachments/{attachment_id}/download")
def download_lesson_attachment(attachment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attachment = _get_owned_attachment(db, attachment_id, user)
    return Response(
        attachment.data, media_type=attachment.content_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'},
    )


@router.delete("/lesson-attachments/{attachment_id}", status_code=204)
def delete_lesson_attachment(attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attachment = _get_owned_attachment(db, attachment_id, user)
    db.delete(attachment)
    db.commit()
    logger.info(f"Anexo removido: id={attachment_id}", extra={"event": "lesson_attachment_deleted", "actor_id": user.id, "outcome": "success"})
