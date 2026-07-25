"""Testes de isolamento por professor em cursos, módulos e disciplinas —
cada professor só deve ver e gerenciar o próprio catálogo (admin vê tudo)."""

from fastapi.testclient import TestClient

from app.main import app


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email, name="Professor Teste", bootstrap_token=None):
    headers = {"X-Bootstrap-Admin-Token": bootstrap_token} if bootstrap_token else {}
    response = client.post("/auth/register", json={
        "name": name, "email": email, "password": "senha-super-longa-123456", "privacy_consent": True,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_course(client, name="Curso Teste"):
    response = client.post("/courses/", headers=_csrf_headers(client), json={
        "name": name, "academic_level": "mba", "year": 2026,
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _create_module(client, course_id, name="Módulo 1"):
    response = client.post("/modules/", headers=_csrf_headers(client), json={"name": name, "course_id": course_id})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _create_discipline(client, module_id, name="Disciplina 1", code="D-1"):
    response = client.post("/disciplines/", headers=_csrf_headers(client), json={
        "name": name, "code": code, "module_id": module_id,
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_professor_does_not_see_another_professors_course(client):
    _register(client, "dono-curso@example.com")
    course_id = _create_course(client)

    other = TestClient(app)
    _register(other, "outro-curso@example.com")

    listing = other.get("/courses/")
    assert listing.status_code == 200
    assert all(c["id"] != course_id for c in listing.json())


def test_professor_cannot_update_or_delete_another_professors_course(client):
    _register(client, "dono-curso2@example.com")
    course_id = _create_course(client, name="Curso Protegido")

    intruder = TestClient(app)
    _register(intruder, "intruso-curso@example.com")

    update = intruder.put(f"/courses/{course_id}", headers=_csrf_headers(intruder), json={"name": "Hackeado"})
    assert update.status_code == 403

    delete = intruder.delete(f"/courses/{course_id}", headers=_csrf_headers(intruder))
    assert delete.status_code == 403


def test_two_professors_can_use_the_same_course_name(client):
    _register(client, "prof-a-nome@example.com")
    course_a = _create_course(client, name="MBA em Gestão")

    other = TestClient(app)
    _register(other, "prof-b-nome@example.com")
    course_b = _create_course(other, name="MBA em Gestão")

    assert course_a != course_b


def test_admin_sees_and_manages_any_course(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe-cursos@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "token-secreto-teste")
    admin_client = TestClient(app)
    _register(admin_client, "chefe-cursos@example.com", name="Chefe Admin", bootstrap_token="token-secreto-teste")

    _register(client, "prof-admin-view@example.com")
    course_id = _create_course(client, name="Curso Visível ao Admin")

    listing = admin_client.get("/courses/")
    assert any(c["id"] == course_id for c in listing.json())

    update = admin_client.put(f"/courses/{course_id}", headers=_csrf_headers(admin_client), json={"name": "Renomeado pelo Admin"})
    assert update.status_code == 200


def test_cannot_create_module_on_another_professors_course(client):
    _register(client, "dono-modulo@example.com")
    course_id = _create_course(client, name="Curso com Módulo Alheio")

    other = TestClient(app)
    _register(other, "invasor-modulo@example.com")
    response = other.post("/modules/", headers=_csrf_headers(other), json={"name": "Módulo Invasor", "course_id": course_id})
    assert response.status_code == 403


def test_module_and_discipline_listing_isolated_per_professor(client):
    _register(client, "dono-listagem@example.com")
    course_id = _create_course(client, name="Curso Listagem")
    module_id = _create_module(client, course_id)
    _create_discipline(client, module_id)

    other = TestClient(app)
    _register(other, "outro-listagem@example.com")

    assert other.get(f"/courses/{course_id}/modules").status_code == 403
    assert other.get(f"/modules/{module_id}/disciplines").status_code == 403


def test_two_professors_can_reuse_the_same_discipline_code(client):
    _register(client, "prof-a-codigo@example.com")
    course_a = _create_course(client, name="Curso Código A")
    module_a = _create_module(client, course_a)
    _create_discipline(client, module_a, code="ESTAT101")

    other = TestClient(app)
    _register(other, "prof-b-codigo@example.com")
    course_b = _create_course(other, name="Curso Código B")
    module_b = _create_module(other, course_b)
    response = other.post("/disciplines/", headers=_csrf_headers(other), json={
        "name": "Estatística", "code": "ESTAT101", "module_id": module_b,
    })
    assert response.status_code == 200


def test_search_disciplines_only_returns_own_catalog(client):
    _register(client, "prof-a-busca@example.com")
    course_a = _create_course(client, name="Curso Busca A")
    module_a = _create_module(client, course_a)
    _create_discipline(client, module_a, name="Estatística Aplicada", code="EST-A")

    other = TestClient(app)
    _register(other, "prof-b-busca@example.com")

    results = other.get("/disciplines/search", params={"q": "Estatística"})
    assert results.status_code == 200
    assert results.json() == []


def test_generate_schedule_rejects_another_professors_course(client):
    _register(client, "dono-cronograma-curso@example.com")
    course_id = _create_course(client, name="Curso p/ Cronograma")
    module_id = _create_module(client, course_id)
    discipline_id = _create_discipline(client, module_id)

    other = TestClient(app)
    _register(other, "invasor-cronograma@example.com")
    response = other.post("/generate-schedule/", headers=_csrf_headers(other), json={
        "course_id": course_id, "module_id": module_id, "discipline_id": discipline_id,
        "format": "presencial", "start_date": "2026-08-03", "recurrence": "na",
        "days_of_week": [], "start_time": "19:00", "end_time": "22:00",
        "holiday_policy": "reschedule",
    })
    assert response.status_code == 403


def test_get_single_course_returns_nested_modules_and_disciplines(client):
    _register(client, "dono-get-curso@example.com")
    course_id = _create_course(client, name="Curso Detalhe")
    module_id = _create_module(client, course_id)
    _create_discipline(client, module_id, name="Disciplina Detalhe", code="DET-1")

    response = client.get(f"/courses/{course_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == course_id
    assert len(body["modules"]) == 1
    assert body["modules"][0]["id"] == module_id
    assert len(body["modules"][0]["disciplines"]) == 1
    assert body["modules"][0]["disciplines"][0]["code"] == "DET-1"


def test_get_single_course_denies_another_professor(client):
    _register(client, "dono-get-curso2@example.com")
    course_id = _create_course(client, name="Curso Privado")

    other = TestClient(app)
    _register(other, "invasor-get-curso@example.com")
    assert other.get(f"/courses/{course_id}").status_code == 403
