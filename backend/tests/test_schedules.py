"""Testes de autorização por professor e dos endpoints de conflito de
horário / edição pontual de data em cronogramas."""

from datetime import date, time

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.base import (
    AcademicLevel, Course, DeliveryFormat, Discipline, Holiday, HolidayPolicy,
    Module, RecurrenceType, ScheduleConfig, ScheduledClass,
)


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email, name="Professor Teste", bootstrap_token=None):
    headers = {"X-Bootstrap-Admin-Token": bootstrap_token} if bootstrap_token else {}
    response = client.post("/auth/register", json={
        "name": name, "email": email, "password": "senha-super-longa-123456", "privacy_consent": True,
    }, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _seed_schedule(owner_id, email_suffix, start_time=time(19, 0), end_time=time(22, 0), on_date=date(2026, 10, 5)):
    db = SessionLocal()
    try:
        course = Course(name=f"Curso {email_suffix}", academic_level=AcademicLevel.MBA, year=2026, institution="Uni X")
        db.add(course)
        db.flush()
        module = Module(name="Módulo 1", course_id=course.id)
        db.add(module)
        db.flush()
        discipline = Discipline(name="Disciplina Teste", code=f"D-{email_suffix}", module_id=module.id)
        db.add(discipline)
        db.flush()
        config = ScheduleConfig(
            course_id=course.id, module_id=module.id, discipline_id=discipline.id, owner_id=owner_id,
            format=DeliveryFormat.PRESENCIAL, start_date=on_date, recurrence=RecurrenceType.NA,
            start_time=start_time, end_time=end_time, holiday_policy=HolidayPolicy.RESCHEDULE,
        )
        db.add(config)
        db.flush()
        lesson = ScheduledClass(config_id=config.id, date=on_date, order=1)
        db.add(lesson)
        db.commit()
        return config.id, lesson.id
    finally:
        db.close()


def test_professor_cannot_see_or_modify_another_professors_schedule(client):
    owner_id = _register(client, "dono@example.com")
    config_id, lesson_id = _seed_schedule(owner_id, "dono")

    intruder = TestClient(app)
    _register(intruder, "intruso@example.com")

    listing = intruder.get("/schedules/configs/")
    assert listing.status_code == 200
    assert all(c["id"] != config_id for c in listing.json())

    assert intruder.get(f"/schedules/{config_id}").status_code == 403
    assert intruder.get(f"/schedules/{config_id}/classes").status_code == 403
    assert intruder.delete(f"/schedules/{config_id}", headers=_csrf_headers(intruder)).status_code == 403
    assert intruder.patch(
        f"/schedules/{config_id}/classes/{lesson_id}", json={"date": "2026-10-12", "reason": "Teste de invasão"},
        headers=_csrf_headers(intruder),
    ).status_code == 403

    # o dono consegue tudo normalmente
    assert client.get(f"/schedules/{config_id}").status_code == 200
    assert client.get(f"/schedules/{config_id}/classes").status_code == 200


def test_admin_sees_and_manages_any_schedule(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "token-secreto-teste")
    admin_client = TestClient(app)
    _register(admin_client, "chefe@example.com", name="Chefe Admin", bootstrap_token="token-secreto-teste")

    owner_id = _register(client, "prof2@example.com")
    config_id, _ = _seed_schedule(owner_id, "prof2")

    listing = admin_client.get("/schedules/configs/")
    assert any(c["id"] == config_id for c in listing.json())
    assert admin_client.get(f"/schedules/{config_id}").status_code == 200


def test_check_conflicts_detects_overlap_and_near_miss(client):
    owner_id = _register(client, "conflito@example.com")
    _seed_schedule(owner_id, "conflito-a", start_time=time(19, 0), end_time=time(21, 0), on_date=date(2026, 11, 3))

    overlap = client.post("/schedules/check-conflicts", headers=_csrf_headers(client), json={
        "dates": ["2026-11-03"], "start_time": "20:00:00", "end_time": "22:00:00",
    })
    assert overlap.status_code == 200
    assert len(overlap.json()["overlaps"]) == 1
    assert overlap.json()["near"] == []

    near = client.post("/schedules/check-conflicts", headers=_csrf_headers(client), json={
        "dates": ["2026-11-03"], "start_time": "21:15:00", "end_time": "23:00:00",
    })
    assert near.status_code == 200
    assert near.json()["overlaps"] == []
    assert len(near.json()["near"]) == 1

    clear = client.post("/schedules/check-conflicts", headers=_csrf_headers(client), json={
        "dates": ["2026-11-03"], "start_time": "22:00:00", "end_time": "23:00:00",
    })
    assert clear.json()["overlaps"] == [] and clear.json()["near"] == []


def test_check_conflicts_ignores_other_professors_classes(client):
    owner_id = _register(client, "isolado@example.com")
    _seed_schedule(owner_id, "isolado", start_time=time(19, 0), end_time=time(21, 0), on_date=date(2026, 11, 4))

    other = TestClient(app)
    _register(other, "outro-prof@example.com")
    response = other.post("/schedules/check-conflicts", headers=_csrf_headers(other), json={
        "dates": ["2026-11-04"], "start_time": "19:00:00", "end_time": "21:00:00",
    })
    assert response.json()["overlaps"] == [] and response.json()["near"] == []


def test_update_scheduled_class_date_changes_only_that_class(client):
    owner_id = _register(client, "editor@example.com")
    config_id, lesson_id = _seed_schedule(owner_id, "editor", on_date=date(2026, 9, 1))

    response = client.patch(
        f"/schedules/{config_id}/classes/{lesson_id}", json={"date": "2026-09-08", "reason": "Ajuste de agenda do professor"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 200
    assert response.json()["date"] == "2026-09-08"

    classes = client.get(f"/schedules/{config_id}/classes").json()
    assert len(classes) == 1
    assert classes[0]["date"] == "2026-09-08"
    assert classes[0]["status"] == "scheduled"
    assert classes[0]["change_reason"] == "Ajuste de agenda do professor"


def test_update_scheduled_class_requires_reason(client):
    owner_id = _register(client, "sem-motivo@example.com")
    config_id, lesson_id = _seed_schedule(owner_id, "sem-motivo", on_date=date(2026, 9, 1))

    response = client.patch(
        f"/schedules/{config_id}/classes/{lesson_id}", json={"date": "2026-09-08"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 422


def test_update_scheduled_class_date_ignores_holiday_block(client):
    """Alteração manual de data (com motivo) nunca é bloqueada por feriado —
    essa checagem só vale para a geração automática do cronograma."""
    owner_id = _register(client, "feriado-manual@example.com")
    config_id, lesson_id = _seed_schedule(owner_id, "feriado-manual", on_date=date(2026, 9, 1))

    db = SessionLocal()
    try:
        db.add(Holiday(date=date(2026, 9, 7), description="Independência do Brasil"))
        db.commit()
    finally:
        db.close()

    response = client.patch(
        f"/schedules/{config_id}/classes/{lesson_id}",
        json={"date": "2026-09-07", "reason": "Professor pediu para manter nesse dia mesmo com feriado"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 200
    assert response.json()["date"] == "2026-09-07"


def test_cancel_scheduled_class_excludes_it_from_conflict_check(client):
    owner_id = _register(client, "cancelador@example.com")
    config_id, lesson_id = _seed_schedule(
        owner_id, "cancelador", start_time=time(19, 0), end_time=time(21, 0), on_date=date(2026, 11, 10),
    )

    cancel = client.patch(
        f"/schedules/{config_id}/classes/{lesson_id}",
        json={"date": "2026-11-10", "reason": "Feriado municipal não previsto", "cancelled": True},
        headers=_csrf_headers(client),
    )
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    check = client.post("/schedules/check-conflicts", headers=_csrf_headers(client), json={
        "dates": ["2026-11-10"], "start_time": "19:00:00", "end_time": "21:00:00",
    })
    assert check.json()["overlaps"] == [] and check.json()["near"] == []


def test_reports_aggregates_hours_by_discipline_institution_and_modality(client):
    owner_id = _register(client, "relatorios@example.com")
    _seed_schedule(owner_id, "relatorios", start_time=time(19, 0), end_time=time(22, 0), on_date=date(2026, 9, 1))

    response = client.get("/reports/")
    assert response.status_code == 200
    body = response.json()
    assert body["total_classes"] == 1
    assert body["total_hours"] == 3.0
    assert body["by_discipline"][0] == {"label": "Disciplina Teste", "classes": 1, "hours": 3.0}
    assert body["by_institution"][0] == {"label": "Uni X", "classes": 1, "hours": 3.0}
    assert body["by_modality"] == {"presencial": 1, "remoto": 0}


def test_reports_isolated_per_professor(client):
    owner_id = _register(client, "relatorios-dono@example.com")
    _seed_schedule(owner_id, "relatorios-dono")

    other = TestClient(app)
    _register(other, "relatorios-outro@example.com")
    response = other.get("/reports/")
    assert response.status_code == 200
    assert response.json()["total_classes"] == 0
