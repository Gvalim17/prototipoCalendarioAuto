"""Testes de regressão para a exclusão de conta (LGPD art. 18, IX — direito à
eliminação). Antes da correção, excluir a conta apagava só o usuário e a
sessão: cursos, cronogramas, roteiros de aula e anexos ficavam órfãos no
banco para sempre (owner_id nulificado por ondelete=SET NULL). Estes testes
garantem que a exclusão hoje remove todo o catálogo do titular, sem afetar
dados de outros professores."""

from datetime import date, datetime, time

from app.database import SessionLocal
from app.models.base import (
    AcademicLevel, Course, DeliveryFormat, Discipline, HolidayPolicy,
    LessonAttachment, LessonScript, LessonShareLink, Module,
    RecurrenceType, ScheduleConfig, ScheduledClass, User,
)


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email, name="Professora Teste"):
    return client.post("/auth/register", json={
        "name": name, "email": email, "password": "senha-super-longa-123456", "privacy_consent": True,
    })


def _register_get_id(client, email):
    return _register(client, email).json()["id"]


def _seed_full_academic_tree(owner_id: int, email: str):
    """Cria curso/módulo/disciplina/cronograma/aula + roteiro/anexo/link de
    compartilhamento — a árvore completa de dados de um professor."""
    db = SessionLocal()
    try:
        course = Course(name=f"Curso {email}", academic_level=AcademicLevel.MBA, year=2026, owner_id=owner_id)
        db.add(course)
        db.flush()
        module = Module(name="Módulo 1", course_id=course.id, owner_id=owner_id)
        db.add(module)
        db.flush()
        discipline = Discipline(name="Disciplina Teste", code=f"D-{email}", module_id=module.id, owner_id=owner_id)
        db.add(discipline)
        db.flush()
        config = ScheduleConfig(
            course_id=course.id, module_id=module.id, discipline_id=discipline.id, owner_id=owner_id,
            format=DeliveryFormat.PRESENCIAL, start_date=date(2026, 10, 5), recurrence=RecurrenceType.NA,
            start_time=time(19, 0), end_time=time(22, 0), holiday_policy=HolidayPolicy.RESCHEDULE,
        )
        db.add(config)
        db.flush()
        lesson = ScheduledClass(config_id=config.id, date=date(2026, 10, 5), order=1)
        db.add(lesson)
        db.flush()
        now = datetime(2026, 10, 1)
        script = LessonScript(
            scheduled_class_id=lesson.id, owner_id=owner_id, topic="Aula 1",
            content="conteúdo", created_at=now, updated_at=now,
        )
        db.add(script)
        db.flush()
        db.add(LessonAttachment(
            lesson_script_id=script.id, filename="slides.pdf", content_type="application/pdf",
            size_bytes=3, data=b"pdf", uploaded_at=now,
        ))
        db.add(LessonShareLink(
            lesson_script_id=script.id, token_hash=f"{email}-hash".ljust(64, "x")[:64],
            created_at=now, expires_at=datetime(2026, 10, 8),
        ))
        db.commit()
        return {
            "course_id": course.id, "module_id": module.id, "discipline_id": discipline.id,
            "config_id": config.id, "lesson_id": lesson.id, "script_id": script.id,
        }
    finally:
        db.close()


def _counts(db):
    return {
        "courses": db.query(Course).count(),
        "modules": db.query(Module).count(),
        "disciplines": db.query(Discipline).count(),
        "configs": db.query(ScheduleConfig).count(),
        "classes": db.query(ScheduledClass).count(),
        "scripts": db.query(LessonScript).count(),
        "attachments": db.query(LessonAttachment).count(),
        "share_links": db.query(LessonShareLink).count(),
    }


def test_deleting_account_purges_owned_academic_data(client):
    owner_id = _register_get_id(client, "titular@example.com")
    _seed_full_academic_tree(owner_id, "titular@example.com")

    response = client.delete("/auth/me", headers=_csrf_headers(client))
    assert response.status_code == 204

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.id == owner_id).first() is None
        counts = _counts(db)
        assert counts == {
            "courses": 0, "modules": 0, "disciplines": 0, "configs": 0,
            "classes": 0, "scripts": 0, "attachments": 0, "share_links": 0,
        }
    finally:
        db.close()


def test_deleting_account_does_not_affect_another_professors_data(client):
    owner_id = _register_get_id(client, "titular2@example.com")
    _seed_full_academic_tree(owner_id, "titular2@example.com")

    from fastapi.testclient import TestClient
    from app.main import app
    other = TestClient(app)
    other_id = _register_get_id(other, "outro-professor@example.com")
    _seed_full_academic_tree(other_id, "outro-professor@example.com")

    response = client.delete("/auth/me", headers=_csrf_headers(client))
    assert response.status_code == 204

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.id == owner_id).first() is None
        assert db.query(User).filter(User.id == other_id).first() is not None
        counts = _counts(db)
        assert counts == {
            "courses": 1, "modules": 1, "disciplines": 1, "configs": 1,
            "classes": 1, "scripts": 1, "attachments": 1, "share_links": 1,
        }
    finally:
        db.close()
