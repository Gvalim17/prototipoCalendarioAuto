"""Testes de regressão para o fluxo de autenticação: registro, login, CSRF,
throttling, recuperação de senha, bootstrap do administrador e gestão de
usuários. Esta é a parte mais sensível do sistema em termos de segurança —
é a que mais se beneficia de cobertura automatizada.
"""

from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import app.routers.auth as auth_module
import app.routers.users as users_module
from app.database import SessionLocal
from app.models.base import User
from app.security import hash_password


def _csrf_headers(client):
    token = client.cookies.get("calendario_csrf")
    return {"X-CSRF-Token": token} if token else {}


def _register(client, email="prof@example.com", password="senha-super-longa-123", name="Professora Teste"):
    return client.post("/auth/register", json={
        "name": name, "email": email, "password": password, "privacy_consent": True,
    })


def _register_admin(client, email="admin@example.com", password="senha-super-longa-123456", name="Admin Teste"):
    """Cria uma conta admin direto no banco (o bootstrap por token é testado
    à parte, em sua própria seção) e autentica normalmente via login."""
    db = SessionLocal()
    try:
        db.add(User(
            name=name, email=email, password_hash=hash_password(password),
            role="admin", created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        db.commit()
    finally:
        db.close()
    return client.post("/auth/login", json={"email": email, "password": password})


def _mock_email(monkeypatch, module):
    captured = []

    def _send(recipient, reset_url):
        captured.append((recipient, reset_url))

    monkeypatch.setattr(module, "send_password_reset_email", _send)
    return captured


# ── Registro ──────────────────────────────────────────────────────────────

def test_register_default_role_is_professor(client):
    response = _register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "professor"
    # cookies de sessão devem ter sido emitidos
    assert client.cookies.get("calendario_session")
    assert client.cookies.get("calendario_csrf")


def test_register_never_grants_admin_without_bootstrap_config(client):
    """Sem BOOTSTRAP_ADMIN_EMAIL/TOKEN configurados, ninguém vira admin
    sozinho — nem sendo a primeira conta do sistema."""
    response = _register(client, email="primeira-conta@example.com")
    assert response.json()["role"] == "professor"
    second = _register(client, email="segunda-conta@example.com")
    assert second.json()["role"] == "professor"


def test_register_rejects_duplicate_email(client):
    _register(client, email="dup@example.com")
    response = _register(client, email="dup@example.com")
    assert response.status_code == 409


def test_register_requires_privacy_consent(client):
    response = client.post("/auth/register", json={
        "name": "Sem Consentimento", "email": "semconsentimento@example.com",
        "password": "senha-super-longa-123", "privacy_consent": False,
    })
    assert response.status_code == 422


def test_register_rejects_short_password(client):
    response = client.post("/auth/register", json={
        "name": "Senha Curta", "email": "curta@example.com",
        "password": "123", "privacy_consent": True,
    })
    assert response.status_code == 422


def test_register_throttled_after_too_many_attempts_from_same_ip(client):
    for i in range(auth_module.MAX_REGISTER_ATTEMPTS):
        response = _register(client, email=f"flood{i}@example.com")
        assert response.status_code == 201
    blocked = _register(client, email="flood-extra@example.com")
    assert blocked.status_code == 429


# ── Bootstrap do administrador (BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_TOKEN) ──

def test_bootstrap_email_without_token_is_rejected(client, monkeypatch):
    """E-mail bate com o bootstrap, mas nenhum token foi enviado: a conta
    nem deve ser criada (evita que alguém 'reserve' o e-mail do admin)."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "segredo-forte-123")
    response = _register(client, email="chefe@example.com")
    assert response.status_code == 403
    assert client.get("/auth/me").status_code == 401


def test_bootstrap_email_with_wrong_token_is_rejected(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "segredo-forte-123")
    response = client.post(
        "/auth/register",
        json={"name": "Invasor", "email": "chefe@example.com", "password": "senha-super-longa-123", "privacy_consent": True},
        headers={"X-Bootstrap-Admin-Token": "chute-qualquer"},
    )
    assert response.status_code == 403


def test_bootstrap_email_with_correct_token_becomes_admin(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "segredo-forte-123")
    response = client.post(
        "/auth/register",
        json={"name": "Chefe", "email": "chefe@example.com", "password": "senha-super-longa-123", "privacy_consent": True},
        headers={"X-Bootstrap-Admin-Token": "segredo-forte-123"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


def test_bootstrap_email_does_not_affect_other_registrations(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "segredo-forte-123")
    response = _register(client, email="qualquer-outra@example.com")
    assert response.status_code == 201
    assert response.json()["role"] == "professor"


def test_bootstrap_closes_after_first_admin_exists(client, monkeypatch):
    """Mesmo com o token certo, o bootstrap só funciona enquanto nenhum
    admin existir — depois disso, o caminho se fecha sozinho."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "chefe@example.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_TOKEN", "segredo-forte-123")
    _register_admin(client, email="outro-admin-ja-existente@example.com")
    client.cookies.clear()

    response = client.post(
        "/auth/register",
        json={"name": "Chefe Tarde Demais", "email": "chefe@example.com", "password": "senha-super-longa-123", "privacy_consent": True},
        headers={"X-Bootstrap-Admin-Token": "segredo-forte-123"},
    )
    assert response.status_code == 403


# ── Login ─────────────────────────────────────────────────────────────────

def test_login_success_issues_session_cookies(client):
    _register(client, email="login@example.com", password="senha-valida-123456")
    client.cookies.clear()
    response = client.post("/auth/login", json={"email": "login@example.com", "password": "senha-valida-123456"})
    assert response.status_code == 200
    assert client.cookies.get("calendario_session")


def test_login_rejects_wrong_password(client):
    _register(client, email="login2@example.com", password="senha-valida-123456")
    client.cookies.clear()
    response = client.post("/auth/login", json={"email": "login2@example.com", "password": "senha-errada"})
    assert response.status_code == 401


def test_login_throttled_after_repeated_failures(client):
    _register(client, email="login3@example.com", password="senha-valida-123456")
    client.cookies.clear()
    for _ in range(auth_module.MAX_LOGIN_FAILURES):
        response = client.post("/auth/login", json={"email": "login3@example.com", "password": "errada"})
        assert response.status_code == 401
    blocked = client.post("/auth/login", json={"email": "login3@example.com", "password": "errada"})
    assert blocked.status_code == 429
    # mesmo com a senha certa, continua bloqueado até a janela expirar
    still_blocked = client.post("/auth/login", json={"email": "login3@example.com", "password": "senha-valida-123456"})
    assert still_blocked.status_code == 429


def test_successful_login_clears_previous_failure_count(client):
    _register(client, email="login4@example.com", password="senha-valida-123456")
    client.cookies.clear()
    client.post("/auth/login", json={"email": "login4@example.com", "password": "errada"})
    client.post("/auth/login", json={"email": "login4@example.com", "password": "senha-valida-123456"})
    client.cookies.clear()
    # após um login bem-sucedido, o contador zera — não deveria bloquear de imediato
    response = client.post("/auth/login", json={"email": "login4@example.com", "password": "errada"})
    assert response.status_code == 401


# ── /auth/me e CSRF ───────────────────────────────────────────────────────

def test_me_requires_authentication(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user_when_authenticated(client):
    _register(client, email="me@example.com")
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


def test_logout_without_csrf_header_is_rejected(client):
    _register(client, email="csrf@example.com")
    response = client.post("/auth/logout")
    assert response.status_code == 403


def test_logout_with_valid_csrf_header_succeeds(client):
    _register(client, email="csrf2@example.com")
    response = client.post("/auth/logout", headers=_csrf_headers(client))
    assert response.status_code == 204
    # sessão revogada: /auth/me deve voltar a exigir login
    assert client.get("/auth/me").status_code == 401


def test_logout_with_mismatched_csrf_token_is_rejected(client):
    _register(client, email="csrf3@example.com")
    response = client.post("/auth/logout", headers={"X-CSRF-Token": "token-invalido"})
    assert response.status_code == 403


# ── Recuperação de senha ──────────────────────────────────────────────────

def test_password_reset_request_for_unknown_email_returns_generic_message(client):
    response = client.post("/auth/password-reset/request", json={"email": "ninguem@example.com"})
    assert response.status_code == 202
    assert "Se existir uma conta" in response.json()["message"]


def test_password_reset_full_flow_revokes_old_sessions(client, monkeypatch):
    captured = _mock_email(monkeypatch, auth_module)
    _register(client, email="reset@example.com", password="senha-antiga-123456")
    old_session = client.cookies.get("calendario_session")

    response = client.post("/auth/password-reset/request", json={"email": "reset@example.com"})
    assert response.status_code == 202
    assert len(captured) == 1
    reset_url = captured[0][1]
    token = parse_qs(urlparse(reset_url).query)["token"][0]

    confirm = client.post("/auth/password-reset/confirm", json={"token": token, "new_password": "senha-nova-123456"})
    assert confirm.status_code == 200
    new_session = client.cookies.get("calendario_session")
    assert new_session != old_session

    # login com a senha antiga deve falhar; com a nova, funcionar
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "reset@example.com", "password": "senha-antiga-123456"}).status_code == 401
    assert client.post("/auth/login", json={"email": "reset@example.com", "password": "senha-nova-123456"}).status_code == 200


def test_password_reset_confirm_rejects_invalid_token(client):
    response = client.post("/auth/password-reset/confirm", json={"token": "x" * 40, "new_password": "senha-nova-123456"})
    assert response.status_code == 400


# ── Gestão de usuários (admin) ────────────────────────────────────────────

def test_non_admin_cannot_list_users(client):
    _register_admin(client, email="owner@example.com")
    client.cookies.clear()
    _register(client, email="comum@example.com")  # conta comum = professor
    response = client.get("/users/")
    assert response.status_code == 403


def test_admin_can_invite_list_promote_and_remove_users(client, monkeypatch):
    captured = _mock_email(monkeypatch, users_module)
    _register_admin(client, email="admin2@example.com")

    invite = client.post("/users/", json={"name": "Novo Professor", "email": "novo@example.com", "role": "professor"}, headers=_csrf_headers(client))
    assert invite.status_code == 201
    assert len(captured) == 1
    new_user_id = invite.json()["id"]

    listing = client.get("/users/")
    assert listing.status_code == 200
    assert any(u["email"] == "novo@example.com" for u in listing.json())

    promote = client.patch(f"/users/{new_user_id}/role", json={"role": "admin"}, headers=_csrf_headers(client))
    assert promote.status_code == 200
    assert promote.json()["role"] == "admin"

    remove = client.delete(f"/users/{new_user_id}", headers=_csrf_headers(client))
    assert remove.status_code == 204


def test_cannot_remove_the_last_admin(client):
    _register_admin(client, email="soloadmin@example.com")
    me = client.get("/auth/me").json()
    response = client.delete(f"/users/{me['id']}", headers=_csrf_headers(client))
    # remoção da própria conta por essa rota é bloqueada explicitamente
    assert response.status_code == 422


def test_admin_cannot_demote_the_last_admin(client):
    _register_admin(client, email="soloadmin2@example.com")
    me = client.get("/auth/me").json()
    response = client.patch(f"/users/{me['id']}/role", json={"role": "professor"}, headers=_csrf_headers(client))
    assert response.status_code == 422


def test_invite_rejects_duplicate_email(client, monkeypatch):
    _mock_email(monkeypatch, users_module)
    _register_admin(client, email="admin3@example.com")
    response = client.post("/users/", json={"name": "Duplicado", "email": "admin3@example.com", "role": "professor"}, headers=_csrf_headers(client))
    assert response.status_code == 409
