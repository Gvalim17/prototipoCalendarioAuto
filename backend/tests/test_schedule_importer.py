"""Testes de importação de cronogramas via planilha (.xlsx)."""

import io

import pandas as pd

from app.database import SessionLocal
from app.models.base import Course, Discipline, Module, ScheduleConfig


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email="importador@example.com"):
    response = client.post("/auth/register", json={
        "name": "Professor Importador", "email": email,
        "password": "senha-super-longa-123456", "privacy_consent": True,
    })
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _xlsx_bytes(rows: list[dict]) -> bytes:
    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Cronograma")
    buffer.seek(0)
    return buffer.read()


def _upload(client, content: bytes, filename="cronograma.xlsx"):
    return client.post(
        "/schedules/import/xlsx",
        headers=_csrf_headers(client),
        files={"file": (filename, content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


def test_import_creates_course_module_discipline_and_classes(client):
    _register(client)
    rows = [
        {
            "Instituição": "Uni X", "Nível": "MBA", "Curso": "MBA em Dados", "Semestre": 1,
            "Módulo": "Módulo 1", "Disciplina": "Estatística Aplicada", "Formato": "Presencial",
            "Data": "2026-09-01", "Início": "19:00", "Término": "22:00",
        },
        {
            "Instituição": "Uni X", "Nível": "MBA", "Curso": "MBA em Dados", "Semestre": 1,
            "Módulo": "Módulo 1", "Disciplina": "Estatística Aplicada", "Formato": "Presencial",
            "Data": "2026-09-08", "Início": "19:00", "Término": "22:00",
        },
    ]
    response = _upload(client, _xlsx_bytes(rows))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["imported_configs"] == 1
    assert body["imported_classes"] == 2
    assert body["skipped_groups"] == 0

    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.name == "MBA em Dados").first()
        assert course is not None
        assert course.institution == "Uni X"
        module = db.query(Module).filter(Module.course_id == course.id).first()
        assert module.name == "Módulo 1"
        discipline = db.query(Discipline).filter(Discipline.module_id == module.id).first()
        assert discipline.name == "Estatística Aplicada"
        config = db.query(ScheduleConfig).filter(ScheduleConfig.discipline_id == discipline.id).first()
        assert config.num_classes == 2
        assert config.workload == 6
    finally:
        db.close()

    listing = client.get("/schedules/configs/")
    assert len(listing.json()) == 1


def test_import_reuses_existing_course_by_name(client):
    _register(client)
    first = _upload(client, _xlsx_bytes([
        {
            "Curso": "Curso Existente", "Módulo": "Módulo A", "Disciplina": "Disciplina A",
            "Formato": "Remoto", "Data": "2026-10-05", "Início": "19:00", "Término": "21:00",
        },
    ]))
    assert first.status_code == 200

    second = _upload(client, _xlsx_bytes([
        {
            "Curso": "Curso Existente", "Módulo": "Módulo B", "Disciplina": "Disciplina B",
            "Formato": "Remoto", "Data": "2026-10-12", "Início": "19:00", "Término": "21:00",
        },
    ]))
    assert second.status_code == 200

    db = SessionLocal()
    try:
        courses = db.query(Course).filter(Course.name == "Curso Existente").all()
        assert len(courses) == 1
    finally:
        db.close()


def test_import_reports_row_errors_without_failing_whole_file(client):
    _register(client)
    rows = [
        {"Curso": "Curso Válido", "Módulo": "M1", "Disciplina": "D1", "Formato": "Presencial", "Data": "2026-09-01", "Início": "19:00", "Término": "22:00"},
        {"Curso": "", "Módulo": "M1", "Disciplina": "D1", "Formato": "Presencial", "Data": "2026-09-08", "Início": "19:00", "Término": "22:00"},
    ]
    response = _upload(client, _xlsx_bytes(rows))
    assert response.status_code == 200
    body = response.json()
    assert body["imported_configs"] == 1
    assert len(body["errors"]) == 1


def test_import_rejects_unsupported_extension(client):
    _register(client)
    response = _upload(client, b"not a real file", filename="cronograma.txt")
    assert response.status_code == 400


def test_import_is_rate_limited_per_user(client):
    """Sem limite, uma planilha grande poderia ser reenviada em loop e
    sobrecarregar o parser/DB. Depois de MAX tentativas na janela, a rota
    deve responder 429 em vez de continuar processando uploads."""
    _register(client)
    content = b"not a real file"
    for _ in range(10):
        _upload(client, content, filename="cronograma.txt")
    response = _upload(client, content, filename="cronograma.txt")
    assert response.status_code == 429
