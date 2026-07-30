import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import ensure_owner_or_admin, get_current_user, get_discipline_or_404, rate_limit_user
from ..logging_config import get_logger
from ..models.base import Discipline, LessonAttachment, LessonPlan, LessonScript, LessonShareLink, ScheduledClass, User
from ..schemas.lesson_schemas import (
    LessonPlanRead,
    LessonPlanUpdate,
    LessonScriptRead,
    LessonScriptUpdate,
    PublicLessonMaterialsRead,
    SendLessonEmailRequest,
    ShareLinkCreated,
    ShareLinkRead,
)
from ..security import hash_token, new_token
from ..services.attachment_crypto import decrypt_attachment, encrypt_attachment
from ..services.email_service import EmailDeliveryError, send_lesson_material_email
from ..services.lesson_export import (
    render_lesson_plan_docx,
    render_lesson_plan_pdf,
    render_lesson_script_docx,
    render_lesson_script_pdf,
)


router = APIRouter(tags=["Planejamento de Aulas"])
public_lesson_materials_router = APIRouter(prefix="/public/lesson-materials", tags=["Materiais Públicos"])
logger = get_logger()

MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024  # 5MB — arquivos ficam no banco, sem storage externo
MAX_ATTACHMENTS_PER_SCRIPT = 8
SHARE_LINK_VALIDITY_DAYS = 7
MAX_EMAIL_ATTACHMENTS_TOTAL_SIZE = 20 * 1024 * 1024  # 20MB por envio (roteiro + anexos)


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
    attachment = (
        db.query(LessonAttachment)
        .options(joinedload(LessonAttachment.lesson_script).joinedload(LessonScript.scheduled_class).joinedload(ScheduledClass.config))
        .filter(LessonAttachment.id == attachment_id)
        .first()
    )
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
        size_bytes=len(content), data=encrypt_attachment(content), uploaded_at=_now(),
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
        decrypt_attachment(attachment.data), media_type=attachment.content_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'},
    )


@router.delete("/lesson-attachments/{attachment_id}", status_code=204)
def delete_lesson_attachment(attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attachment = _get_owned_attachment(db, attachment_id, user)
    db.delete(attachment)
    db.commit()
    logger.info(f"Anexo removido: id={attachment_id}", extra={"event": "lesson_attachment_deleted", "actor_id": user.id, "outcome": "success"})


# --- Exportação do roteiro de uma aula específica (PDF/Word) ---
@router.get("/lessons/{scheduled_class_id}/script/export.docx")
def export_lesson_script_docx(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson = _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = _get_or_default_script(db, scheduled_class_id)
    buffer = render_lesson_script_docx(lesson.config.discipline.name, lesson.date.strftime("%d/%m/%Y"), script)
    filename = f"roteiro_{lesson.config.discipline.code}_{lesson.date.isoformat()}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/lessons/{scheduled_class_id}/script/export.pdf")
def export_lesson_script_pdf(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson = _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = _get_or_default_script(db, scheduled_class_id)
    buffer = render_lesson_script_pdf(lesson.config.discipline.name, lesson.date.strftime("%d/%m/%Y"), script)
    filename = f"roteiro_{lesson.config.discipline.code}_{lesson.date.isoformat()}.pdf"
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Link público de compartilhamento (só anexos, expira em 7 dias) ---
def _active_share_link(db: Session, lesson_script_id: int) -> LessonShareLink | None:
    now = _now()
    return (
        db.query(LessonShareLink)
        .filter(
            LessonShareLink.lesson_script_id == lesson_script_id,
            LessonShareLink.revoked_at.is_(None),
            LessonShareLink.expires_at > now,
        )
        .order_by(LessonShareLink.created_at.desc())
        .first()
    )


def _share_link_url(token: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/material/{token}"


@router.get("/lessons/{scheduled_class_id}/share-link", response_model=ShareLinkRead)
def get_share_link_status(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson = _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = db.query(LessonScript).filter(LessonScript.scheduled_class_id == lesson.id).first()
    if not script:
        return ShareLinkRead(active=False)
    link = _active_share_link(db, script.id)
    if not link:
        return ShareLinkRead(active=False)
    return ShareLinkRead(active=True, expires_at=link.expires_at)


@router.post("/lessons/{scheduled_class_id}/share-link", response_model=ShareLinkCreated, status_code=201)
def create_share_link(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = _get_or_create_script(db, scheduled_class_id, user)

    now = _now()
    # Revoga links anteriores ainda ativos: só um link válido por vez, para
    # que o professor sempre saiba exatamente qual token está circulando.
    db.query(LessonShareLink).filter(
        LessonShareLink.lesson_script_id == script.id,
        LessonShareLink.revoked_at.is_(None),
    ).update({"revoked_at": now})

    token = new_token()
    expires_at = now + timedelta(days=SHARE_LINK_VALIDITY_DAYS)
    db.add(LessonShareLink(
        lesson_script_id=script.id, token_hash=hash_token(token),
        created_at=now, expires_at=expires_at,
    ))
    db.commit()
    logger.info(
        f"Link de compartilhamento criado: aula={scheduled_class_id}",
        extra={"event": "lesson_share_link_created", "actor_id": user.id, "outcome": "success"},
    )
    return ShareLinkCreated(active=True, token=token, url=_share_link_url(token), expires_at=expires_at)


@router.delete("/lessons/{scheduled_class_id}/share-link", status_code=204)
def revoke_share_link(scheduled_class_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson = _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = db.query(LessonScript).filter(LessonScript.scheduled_class_id == lesson.id).first()
    if script:
        db.query(LessonShareLink).filter(
            LessonShareLink.lesson_script_id == script.id,
            LessonShareLink.revoked_at.is_(None),
        ).update({"revoked_at": _now()})
        db.commit()
    logger.info(
        f"Link de compartilhamento revogado: aula={scheduled_class_id}",
        extra={"event": "lesson_share_link_revoked", "actor_id": user.id, "outcome": "success"},
    )


def _get_valid_share_link_or_404(db: Session, token: str) -> LessonShareLink:
    link = db.query(LessonShareLink).filter(LessonShareLink.token_hash == hash_token(token)).first()
    if not link or link.revoked_at is not None or link.expires_at <= _now():
        raise HTTPException(status_code=404, detail="Link inválido ou expirado.")
    return link


@public_lesson_materials_router.get("/{token}", response_model=PublicLessonMaterialsRead)
def get_public_lesson_materials(token: str, db: Session = Depends(get_db)):
    link = _get_valid_share_link_or_404(db, token)
    script = (
        db.query(LessonScript)
        .options(
            joinedload(LessonScript.attachments),
            joinedload(LessonScript.scheduled_class).joinedload(ScheduledClass.config).joinedload("discipline"),
            joinedload(LessonScript.scheduled_class).joinedload(ScheduledClass.config).joinedload("course"),
        )
        .filter(LessonScript.id == link.lesson_script_id)
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Material não encontrado.")
    lesson = script.scheduled_class
    return PublicLessonMaterialsRead(
        discipline_name=lesson.config.discipline.name,
        course_name=lesson.config.course.name,
        date=lesson.date.strftime("%d/%m/%Y"),
        topic=script.topic,
        attachments=[{"id": a.id, "filename": a.filename, "size_bytes": a.size_bytes} for a in script.attachments],
    )


@public_lesson_materials_router.get("/{token}/attachments/{attachment_id}/download")
def download_public_lesson_attachment(token: str, attachment_id: int, db: Session = Depends(get_db)):
    link = _get_valid_share_link_or_404(db, token)
    attachment = db.query(LessonAttachment).filter(
        LessonAttachment.id == attachment_id,
        LessonAttachment.lesson_script_id == link.lesson_script_id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")
    return Response(
        decrypt_attachment(attachment.data), media_type=attachment.content_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'},
    )


# --- Envio do material por e-mail ---
@router.post(
    "/lessons/{scheduled_class_id}/send-email",
    status_code=200,
    dependencies=[Depends(rate_limit_user("send_lesson_email", max_events=10, window_seconds=60))],
)
def send_lesson_email(
    scheduled_class_id: int, payload: SendLessonEmailRequest,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    lesson = _get_owned_scheduled_class(db, scheduled_class_id, user)
    script = _get_or_default_script(db, scheduled_class_id)
    discipline_name = lesson.config.discipline.name
    class_date = lesson.date.strftime("%d/%m/%Y")

    attachments: list[tuple[str, str, bytes]] = []
    roteiro_pdf = render_lesson_script_pdf(discipline_name, class_date, script)
    attachments.append((f"roteiro_{class_date.replace('/', '-')}.pdf", "application/pdf", roteiro_pdf.read()))

    total_size = len(attachments[0][2])
    lesson_attachments = script.attachments if not isinstance(script, dict) else []
    for att in lesson_attachments:
        total_size += att.size_bytes
    if total_size > MAX_EMAIL_ATTACHMENTS_TOTAL_SIZE:
        raise HTTPException(status_code=413, detail="Materiais somados excedem 20MB — remova algum anexo antes de enviar por e-mail.")
    for att in lesson_attachments:
        attachments.append((att.filename, att.content_type, decrypt_attachment(att.data)))

    subject = f"Material de aula — {discipline_name} ({class_date})"
    body_lines = [f"Segue o material da aula de {discipline_name} do dia {class_date}."]
    if payload.message:
        body_lines.append("")
        body_lines.append(payload.message)
    body = "\n".join(body_lines)

    failures: list[str] = []
    for recipient in payload.recipients:
        try:
            send_lesson_material_email(recipient, subject, body, attachments)
        except EmailDeliveryError:
            failures.append(recipient)

    logger.info(
        f"Envio de material por e-mail: aula={scheduled_class_id} destinatarios={len(payload.recipients)} falhas={len(failures)}",
        extra={"event": "lesson_material_emailed", "actor_id": user.id, "outcome": "success" if not failures else "partial_failure"},
    )
    if failures and len(failures) == len(payload.recipients):
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail. Verifique os endereços e tente novamente.")
    return {"sent": len(payload.recipients) - len(failures), "failed": failures}
