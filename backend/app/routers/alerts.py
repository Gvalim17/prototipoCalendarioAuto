from __future__ import annotations

import hmac
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.base import AlertNotification, AlertPreference, ScheduledClass, User
from ..schemas.alert_schemas import AlertNotificationRead, AlertPreferenceRead, AlertPreferenceUpdate, CalendarTokenRead
from ..security import hash_token, new_token
from ..services.alert_dispatcher import dispatch_due_alerts


router = APIRouter(prefix="/alerts", tags=["Alertas"])
system_router = APIRouter(prefix="/system/alerts", tags=["Automação"])
# Sem cookie: é a URL que o Google Agenda/Outlook usam para buscar o
# calendário sozinhos, então não pode depender de sessão de navegador.
public_calendar_router = APIRouter(prefix="/calendar", tags=["Calendário Público"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _preference(db: Session, user: User) -> AlertPreference:
    preference = db.query(AlertPreference).filter(AlertPreference.user_id == user.id).first()
    if not preference:
        preference = AlertPreference(user_id=user.id, updated_at=_now())
        db.add(preference)
        db.commit()
        db.refresh(preference)
    return preference


@router.get("/preferences", response_model=AlertPreferenceRead)
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _preference(db, user)


@router.put("/preferences", response_model=AlertPreferenceRead)
def update_preferences(
    payload: AlertPreferenceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preference = _preference(db, user)
    preference.enabled = payload.enabled
    preference.minutes_before = ",".join(str(value) for value in payload.minutes_before)
    preference.in_app_enabled = payload.in_app_enabled
    preference.email_enabled = payload.email_enabled
    preference.timezone = payload.timezone
    preference.updated_at = _now()
    db.commit()
    db.refresh(preference)
    return preference


@router.get("/notifications", response_model=list[AlertNotificationRead])
def list_notifications(
    unread_only: bool = False,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AlertNotification).filter(
        AlertNotification.user_id == user.id,
        AlertNotification.channel == "in_app",
    )
    if unread_only:
        query = query.filter(AlertNotification.read_at.is_(None))
    return query.order_by(AlertNotification.created_at.desc()).limit(min(limit, 200)).all()


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.query(AlertNotification).filter(
        AlertNotification.id == notification_id,
        AlertNotification.user_id == user.id,
        AlertNotification.channel == "in_app",
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")
    notification.read_at = _now()
    db.commit()


def _build_ics(db: Session, user: User) -> str:
    lessons = (
        db.query(ScheduledClass)
        .join(ScheduledClass.config)
        .filter(ScheduledClass.config.has(owner_id=user.id))
        .order_by(ScheduledClass.date)
        .all()
    )
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CronEdu//Alertas//PT-BR", "CALSCALE:GREGORIAN"]
    for lesson in lessons:
        if not lesson.config.start_time:
            continue
        start = datetime.combine(lesson.date, lesson.config.start_time)
        end = datetime.combine(lesson.date, lesson.config.end_time or lesson.config.start_time) + timedelta(
            minutes=60 if not lesson.config.end_time else 0
        )
        title = f"{lesson.config.discipline.name} - Aula {lesson.order}".replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
        lines.extend([
            "BEGIN:VEVENT", f"UID:calendario-{user.id}-{lesson.id}@calendario-academico",
            f"DTSTART:{start.strftime('%Y%m%dT%H%M%S')}", f"DTEND:{end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{title}", f"DESCRIPTION:Curso: {lesson.config.course.name}", "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.get("/calendar.ics")
def download_calendar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Download avulso (exige sessão de navegador)."""
    return Response(_build_ics(db, user), media_type="text/calendar", headers={"Content-Disposition": "attachment; filename=calendario-aulas.ics"})


@router.get("/calendar-token", response_model=CalendarTokenRead)
def get_calendar_token(user: User = Depends(get_current_user)):
    return CalendarTokenRead(has_token=bool(user.calendar_token_hash))


@router.post("/calendar-token/rotate")
def rotate_calendar_token(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Gera um novo token de assinatura. O valor em texto puro só aparece
    nesta resposta — só o hash fica salvo, igual sessão/reset de senha."""
    token = new_token()
    user.calendar_token_hash = hash_token(token)
    db.commit()
    return {"token": token, "path": f"/calendar/calendar.ics?token={token}"}


@public_calendar_router.get("/calendar.ics")
def download_calendar_by_token(token: str, db: Session = Depends(get_db)):
    """Endpoint público (sem cookie) usado por Google Agenda/Outlook/Apple
    Calendar para assinar o calendário por URL e atualizar sozinhos."""
    user = db.query(User).filter(User.calendar_token_hash == hash_token(token)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Link de assinatura inválido.")
    return Response(_build_ics(db, user), media_type="text/calendar")


@system_router.post("/dispatch")
def dispatch_alerts(
    x_alert_dispatch_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    expected = os.getenv("ALERT_DISPATCH_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Executor de alertas não configurado.")
    if not x_alert_dispatch_token or not hmac.compare_digest(x_alert_dispatch_token, expected):
        raise HTTPException(status_code=403, detail="Token do executor inválido.")
    return dispatch_due_alerts(db)
