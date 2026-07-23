"""Testes do configurador de aula: Plano de Trabalho Docente (PTD) por
disciplina, roteiro por aula, anexos e o link de assinatura de calendário."""

from datetime import date, time

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.base import (
    AcademicLevel, Course, DeliveryFormat, Discipline, HolidayPolicy,
    Module, RecurrenceType, ScheduleConfig, ScheduledClass,
)


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email="prof-plan@example.com"):
    return client.post("/auth/register", json={
        "name": "Professora Plan", "email": email,
        "password": "senha-super-longa-123456", "privacy_consent": True,
    })


def _register_get_id(client, email):
    return _register(client, email).json()["id"]


def _seed_owned_lesson(owner_id, email):
    """Igual a `_seed_lesson`, mas com owner_id preenchido em curso, módulo,
    disciplina e cronograma — simula um catálogo já isolado por professor."""
    db = SessionLocal()
    try:
        course = Course(name=f"Curso Owned {email}", academic_level=AcademicLevel.MBA, year=2026, owner_id=owner_id)
        db.add(course)
        db.flush()
        module = Module(name="Módulo 1", course_id=course.id, owner_id=owner_id)
        db.add(module)
        db.flush()
        discipline = Discipline(name="Disciplina Teste", code=f"D-owned-{email}", module_id=module.id, owner_id=owner_id)
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
        db.commit()
        return discipline.id, lesson.id
    finally:
        db.close()


def _seed_lesson(email="prof-plan@example.com"):
    """Cria curso/módulo/disciplina/cronograma/aula direto no banco (mais
    rápido que passar pelo fluxo completo de geração de cronograma)."""
    db = SessionLocal()
    try:
        course = Course(name=f"Curso {email}", academic_level=AcademicLevel.MBA, year=2026)
        db.add(course)
        db.flush()
        module = Module(name="Módulo 1", course_id=course.id)
        db.add(module)
        db.flush()
        discipline = Discipline(name="Disciplina Teste", code=f"D-{email}", module_id=module.id)
        db.add(discipline)
        db.flush()
        config = ScheduleConfig(
            course_id=course.id, module_id=module.id, discipline_id=discipline.id,
            format=DeliveryFormat.PRESENCIAL, start_date=date(2026, 10, 5), recurrence=RecurrenceType.NA,
            start_time=time(19, 0), end_time=time(22, 0), holiday_policy=HolidayPolicy.RESCHEDULE,
        )
        db.add(config)
        db.flush()
        lesson = ScheduledClass(config_id=config.id, date=date(2026, 10, 5), order=1)
        db.add(lesson)
        db.commit()
        return discipline.id, lesson.id
    finally:
        db.close()


# ── Plano de Trabalho Docente (PTD) ──────────────────────────────────────────

def test_get_lesson_plan_returns_empty_default_when_not_created(client):
    _register(client)
    discipline_id, _ = _seed_lesson()
    response = client.get(f"/disciplines/{discipline_id}/lesson-plan")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == 0
    assert body["ementa"] is None


def test_upsert_and_read_lesson_plan(client):
    _register(client)
    discipline_id, _ = _seed_lesson()
    payload = {
        "ementa": "Fundamentos de qualidade de dados.",
        "objetivos": "Compreender pipelines de dados confiáveis.",
        "conteudo_programatico": "Aula 1: introdução\nAula 2: prática",
        "metodologia": "Aulas expositivas com exercícios.",
        "recursos_didaticos": "Slides e notebooks.",
        "criterios_avaliacao": "Projeto final.",
        "bibliografia": "Kimball, R. The Data Warehouse Toolkit.",
        "notes": "Observação livre.",
    }
    response = client.put(f"/disciplines/{discipline_id}/lesson-plan", json=payload, headers=_csrf_headers(client))
    assert response.status_code == 200
    body = response.json()
    assert body["ementa"] == payload["ementa"]
    assert body["id"] != 0

    fetched = client.get(f"/disciplines/{discipline_id}/lesson-plan").json()
    assert fetched["bibliografia"] == payload["bibliografia"]


def test_lesson_plan_export_docx_and_pdf(client):
    _register(client)
    discipline_id, _ = _seed_lesson()
    client.put(f"/disciplines/{discipline_id}/lesson-plan", json={"ementa": "Conteúdo de teste."}, headers=_csrf_headers(client))

    docx_response = client.get(f"/disciplines/{discipline_id}/lesson-plan/export.docx")
    assert docx_response.status_code == 200
    assert "wordprocessingml" in docx_response.headers["content-type"]
    assert len(docx_response.content) > 0

    pdf_response = client.get(f"/disciplines/{discipline_id}/lesson-plan/export.pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_lesson_plan_requires_existing_discipline(client):
    _register(client)
    response = client.get("/disciplines/999999/lesson-plan")
    assert response.status_code == 404


# ── Roteiro de aula ───────────────────────────────────────────────────────

def test_get_lesson_script_returns_empty_default(client):
    _register(client)
    _, lesson_id = _seed_lesson()
    response = client.get(f"/lessons/{lesson_id}/script")
    assert response.status_code == 200
    assert response.json()["topic"] is None
    assert response.json()["attachments"] == []


def test_upsert_lesson_script(client):
    _register(client)
    _, lesson_id = _seed_lesson()
    payload = {"topic": "Introdução a métricas de qualidade", "content": "1. Abertura\n2. Estudo de caso"}
    response = client.put(f"/lessons/{lesson_id}/script", json=payload, headers=_csrf_headers(client))
    assert response.status_code == 200
    assert response.json()["topic"] == payload["topic"]

    fetched = client.get(f"/lessons/{lesson_id}/script").json()
    assert fetched["content"] == payload["content"]


def test_lesson_script_requires_existing_lesson(client):
    _register(client)
    response = client.get("/lessons/999999/script")
    assert response.status_code == 404


# ── Anexos ────────────────────────────────────────────────────────────────

def test_upload_download_and_delete_attachment(client):
    _register(client)
    _, lesson_id = _seed_lesson()

    upload = client.post(
        f"/lessons/{lesson_id}/script/attachments",
        files={"file": ("slides.txt", b"conteudo do slide", "text/plain")},
        headers=_csrf_headers(client),
    )
    assert upload.status_code == 201
    attachments = upload.json()["attachments"]
    assert len(attachments) == 1
    attachment_id = attachments[0]["id"]
    assert attachments[0]["filename"] == "slides.txt"

    download = client.get(f"/lesson-attachments/{attachment_id}/download")
    assert download.status_code == 200
    assert download.content == b"conteudo do slide"

    delete = client.delete(f"/lesson-attachments/{attachment_id}", headers=_csrf_headers(client))
    assert delete.status_code == 204
    assert client.get(f"/lesson-attachments/{attachment_id}/download").status_code == 404


def test_upload_rejects_file_over_size_limit(client):
    _register(client)
    _, lesson_id = _seed_lesson()
    oversized = b"x" * (5 * 1024 * 1024 + 1)
    response = client.post(
        f"/lessons/{lesson_id}/script/attachments",
        files={"file": ("grande.bin", oversized, "application/octet-stream")},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 413


def test_upload_rejects_after_max_attachments_reached(client):
    _register(client)
    _, lesson_id = _seed_lesson()
    for i in range(8):
        response = client.post(
            f"/lessons/{lesson_id}/script/attachments",
            files={"file": (f"arquivo{i}.txt", b"conteudo", "text/plain")},
            headers=_csrf_headers(client),
        )
        assert response.status_code == 201
    blocked = client.post(
        f"/lessons/{lesson_id}/script/attachments",
        files={"file": ("extra.txt", b"conteudo", "text/plain")},
        headers=_csrf_headers(client),
    )
    assert blocked.status_code == 422


# ── Assinatura de calendário por token ───────────────────────────────────

def test_calendar_token_starts_absent(client):
    _register(client, email="calendario1@example.com")
    response = client.get("/alerts/calendar-token")
    assert response.status_code == 200
    assert response.json()["has_token"] is False


def test_rotate_calendar_token_and_subscribe_publicly(client):
    _register(client, email="calendario2@example.com")
    rotate = client.post("/alerts/calendar-token/rotate", headers=_csrf_headers(client))
    assert rotate.status_code == 200
    token = rotate.json()["token"]
    assert rotate.json()["path"].startswith("/calendar/calendar.ics?token=")

    has_token = client.get("/alerts/calendar-token").json()["has_token"]
    assert has_token is True

    # rota pública: valida só pelo token, sem depender de sessão
    public_response = client.get(f"/calendar/calendar.ics?token={token}")
    assert public_response.status_code == 200
    assert "BEGIN:VCALENDAR" in public_response.text


def test_public_calendar_rejects_invalid_token(client):
    response = client.get("/calendar/calendar.ics?token=token-invalido-qualquer")
    assert response.status_code == 404


def test_rotating_calendar_token_invalidates_the_previous_one(client):
    _register(client, email="calendario3@example.com")
    first = client.post("/alerts/calendar-token/rotate", headers=_csrf_headers(client)).json()["token"]
    client.post("/alerts/calendar-token/rotate", headers=_csrf_headers(client))

    assert client.get(f"/calendar/calendar.ics?token={first}").status_code == 404


# ── Isolamento entre professores (PTD, roteiro e anexos) ─────────────────────

def test_professor_cannot_read_or_write_another_professors_lesson_plan(client):
    owner_id = _register_get_id(client, "dono-ptd@example.com")
    discipline_id, _ = _seed_owned_lesson(owner_id, "dono-ptd@example.com")

    intruder = TestClient(app)
    _register(intruder, "intruso-ptd@example.com")

    assert intruder.get(f"/disciplines/{discipline_id}/lesson-plan").status_code == 403
    assert intruder.put(
        f"/disciplines/{discipline_id}/lesson-plan", headers=_csrf_headers(intruder), json={"ementa": "invadido"},
    ).status_code == 403
    assert intruder.get(f"/disciplines/{discipline_id}/lesson-plan/export.docx").status_code == 403
    assert intruder.get(f"/disciplines/{discipline_id}/lesson-plan/export.pdf").status_code == 403


def test_professor_cannot_read_or_write_another_professors_lesson_script(client):
    owner_id = _register_get_id(client, "dono-roteiro@example.com")
    _, lesson_id = _seed_owned_lesson(owner_id, "dono-roteiro@example.com")

    intruder = TestClient(app)
    _register(intruder, "intruso-roteiro@example.com")

    assert intruder.get(f"/lessons/{lesson_id}/script").status_code == 403
    assert intruder.put(
        f"/lessons/{lesson_id}/script", headers=_csrf_headers(intruder), json={"topic": "invadido", "content": "x"},
    ).status_code == 403
    assert intruder.post(
        f"/lessons/{lesson_id}/script/attachments", headers=_csrf_headers(intruder),
        files={"file": ("teste.txt", b"conteudo", "text/plain")},
    ).status_code == 403


def test_professor_cannot_download_or_delete_another_professors_attachment(client):
    owner_id = _register_get_id(client, "dono-anexo@example.com")
    _, lesson_id = _seed_owned_lesson(owner_id, "dono-anexo@example.com")
    upload = client.post(
        f"/lessons/{lesson_id}/script/attachments", headers=_csrf_headers(client),
        files={"file": ("teste.txt", b"conteudo", "text/plain")},
    )
    assert upload.status_code == 201
    attachment_id = upload.json()["attachments"][0]["id"]

    intruder = TestClient(app)
    _register(intruder, "intruso-anexo@example.com")

    assert intruder.get(f"/lesson-attachments/{attachment_id}/download").status_code == 403
    assert intruder.delete(f"/lesson-attachments/{attachment_id}", headers=_csrf_headers(intruder)).status_code == 403

    # o dono continua acessando normalmente
    assert client.get(f"/lesson-attachments/{attachment_id}/download").status_code == 200
