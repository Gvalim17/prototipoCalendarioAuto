from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session, joinedload

from ..logging_config import get_logger
from ..models.base import AlertNotification, AlertPreference, ScheduleConfig, ScheduledClass
from .email_service import EmailDeliveryError, send_class_alert_email


logger = get_logger()
DISPATCH_GRACE_MINUTES = 15


def _utc_naive(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("America/Sao_Paulo")


def _lesson_content(scheduled_class: ScheduledClass, event_at: datetime, offset: int) -> tuple[str, str]:
    config = scheduled_class.config
    title = f"Aula em {offset // 60}h" if offset >= 60 else f"Aula em {offset} min"
    time_label = event_at.strftime("%d/%m às %H:%M")
    body = (
        f"{config.discipline.name} - {config.course.name}\n"
        f"Aula {scheduled_class.order} em {time_label}."
    )
    return title, body


def dispatch_due_alerts(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Delivers alerts due in the grace window. The unique database constraint
    makes repeated cron executions safe."""
    current = now or datetime.now(timezone.utc)
    created = 0
    emails_sent = 0
    emails_failed = 0

    preferences = db.query(AlertPreference).options(joinedload(AlertPreference.user)).filter(
        AlertPreference.enabled.is_(True)
    ).all()
    for preference in preferences:
        tz = _timezone(preference.timezone)
        local_now = current.astimezone(tz)
        max_offset = max(preference.offsets, default=0)
        last_date = (local_now + timedelta(minutes=max_offset)).date()
        lessons = (
            db.query(ScheduledClass)
            .join(ScheduledClass.config)
            .options(
                joinedload(ScheduledClass.config).joinedload(ScheduleConfig.course),
                joinedload(ScheduledClass.config).joinedload(ScheduleConfig.discipline),
            )
            .filter(
                ScheduledClass.date >= local_now.date(),
                ScheduledClass.date <= last_date,
                ScheduledClass.config.has(owner_id=preference.user_id),
            )
            .all()
        )
        for lesson in lessons:
            if not lesson.config.start_time:
                continue
            event_at = datetime.combine(lesson.date, lesson.config.start_time, tzinfo=tz)
            if event_at <= local_now:
                continue
            for offset in preference.offsets:
                alert_at = event_at - timedelta(minutes=offset)
                if not alert_at <= local_now < alert_at + timedelta(minutes=DISPATCH_GRACE_MINUTES):
                    continue
                title, body = _lesson_content(lesson, event_at, offset)
                for channel in ("in_app", "email"):
                    if channel == "in_app" and not preference.in_app_enabled:
                        continue
                    if channel == "email" and not preference.email_enabled:
                        continue
                    existing = db.query(AlertNotification.id).filter_by(
                        user_id=preference.user_id,
                        scheduled_class_id=lesson.id,
                        channel=channel,
                        minutes_before=offset,
                    ).first()
                    if existing:
                        continue
                    notification = AlertNotification(
                        user_id=preference.user_id, scheduled_class_id=lesson.id, channel=channel,
                        minutes_before=offset, status="sent", title=title, body=body,
                        scheduled_for=_utc_naive(alert_at), sent_at=datetime.now(timezone.utc).replace(tzinfo=None),
                        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                    if channel == "email":
                        try:
                            send_class_alert_email(preference.user.email, title, body)
                            emails_sent += 1
                        except EmailDeliveryError:
                            notification.status = "failed"
                            emails_failed += 1
                    db.add(notification)
                    created += 1
    db.commit()
    logger.info(
        "Executor de alertas concluído.",
        extra={"event": "alerts_dispatched", "outcome": "success", "resource": "alerts"},
    )
    return {"created": created, "emails_sent": emails_sent, "emails_failed": emails_failed}
