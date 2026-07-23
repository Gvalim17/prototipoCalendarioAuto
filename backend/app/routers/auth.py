from __future__ import annotations

import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_csrf
from ..logging_config import get_logger
from ..models.base import AuthThrottleEvent, PasswordResetToken, User, UserSession
from ..schemas.auth_schemas import (
    CurrentUserRead, LoginRequest, PasswordResetConfirm, PasswordResetRequest,
    PrivacyExportRead, RegisterRequest,
)
from ..security import fingerprint, hash_password, hash_token, new_token, verify_password
from ..services.email_service import EmailDeliveryError, send_password_reset_email


router = APIRouter(prefix="/auth", tags=["Autenticação"])
logger = get_logger()

SESSION_COOKIE = "calendario_session"
CSRF_COOKIE = "calendario_csrf"
GOOGLE_STATE_COOKIE = "calendario_google_state"
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))
PRIVACY_POLICY_VERSION = os.getenv("PRIVACY_POLICY_VERSION", "2026-07")
RESET_TOKEN_MINUTES = 20
MAX_LOGIN_FAILURES = 5
LOGIN_WINDOW_SECONDS = 15 * 60
MAX_RESET_REQUESTS = 3
RESET_WINDOW_SECONDS = 60 * 60
MAX_REGISTER_ATTEMPTS = 5
REGISTER_WINDOW_SECONDS = 60 * 60


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes"}


def _cookie_secure() -> bool:
    return _bool_env("COOKIE_SECURE", not os.getenv("DATABASE_URL", "").startswith("sqlite"))


def _cookie_samesite() -> str:
    value = os.getenv("COOKIE_SAMESITE", "lax").lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _self_registration_allowed() -> bool:
    return _bool_env("ALLOW_SELF_REGISTRATION", True)


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _log_auth(request: Request, message: str, *, event: str, outcome: str, user: User | None = None) -> None:
    level = logger.warning if outcome in {"denied", "error"} else logger.info
    level(
        message,
        extra={
            "event": event,
            "outcome": outcome,
            "actor_id": user.id if user else None,
            "resource": "authentication",
            "request_id": _request_id(request),
        },
    )


def _set_session_cookies(response: Response, session_token: str, csrf_token: str) -> None:
    cookie_options = {
        "max_age": SESSION_DAYS * 24 * 60 * 60,
        "secure": _cookie_secure(),
        "samesite": _cookie_samesite(),
        "path": "/",
    }
    response.set_cookie(SESSION_COOKIE, session_token, httponly=True, **cookie_options)
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, **cookie_options)


def _create_session(db: Session, user: User, response: Response) -> None:
    now = _now()
    session_token = new_token()
    csrf_token = new_token()
    db.add(UserSession(
        user_id=user.id,
        token_hash=hash_token(session_token),
        csrf_token_hash=hash_token(csrf_token),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=SESSION_DAYS),
    ))
    user.last_login_at = now
    db.commit()
    _set_session_cookies(response, session_token, csrf_token)


def _require_privacy_consent(consent: bool) -> None:
    if not consent:
        raise HTTPException(status_code=422, detail="É necessário aceitar a política de privacidade para criar uma conta.")


def _record_consent(user: User) -> None:
    user.privacy_accepted_at = _now()
    user.privacy_policy_version = PRIVACY_POLICY_VERSION


def _throttle_key(request: Request, *parts: str) -> str:
    """Chave estável por IP (+contexto opcional, ex.: e-mail), pseudonimizada.
    Persistida no banco em vez de memória do processo: funciona com múltiplos
    workers/instâncias, ao contrário de um dict local."""
    client = request.client.host if request.client else ""
    return fingerprint(":".join([client, *parts]))


def _check_throttle(db: Session, key: str, kind: str, window_seconds: int, max_events: int) -> None:
    cutoff = _now() - timedelta(seconds=window_seconds)
    db.query(AuthThrottleEvent).filter(
        AuthThrottleEvent.key == key,
        AuthThrottleEvent.kind == kind,
        AuthThrottleEvent.created_at < cutoff,
    ).delete()
    count = db.query(AuthThrottleEvent).filter(
        AuthThrottleEvent.key == key,
        AuthThrottleEvent.kind == kind,
        AuthThrottleEvent.created_at >= cutoff,
    ).count()
    db.commit()
    if count >= max_events:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns minutos e tente novamente.")


def _record_throttle_event(db: Session, key: str, kind: str) -> None:
    db.add(AuthThrottleEvent(key=key, kind=kind, created_at=_now()))
    db.commit()


def _clear_throttle(db: Session, key: str, kind: str) -> None:
    db.query(AuthThrottleEvent).filter(AuthThrottleEvent.key == key, AuthThrottleEvent.kind == kind).delete()
    db.commit()


def _google_settings() -> tuple[str, str, str]:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(status_code=503, detail="Login com Google ainda não foi configurado.")
    return client_id, client_secret, redirect_uri


def _exchange_google_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> str:
    payload = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            token_data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        raise ValueError("Falha ao trocar o código de autorização.") from exc
    token = token_data.get("id_token")
    if not isinstance(token, str):
        raise ValueError("O Google não retornou uma prova de identidade válida.")
    return token


def _admin_bootstrap_match(db: Session, email: str) -> tuple[bool, bool]:
    """Retorna (e-mail bate com BOOTSTRAP_ADMIN_EMAIL, já existe algum admin).
    Sem BOOTSTRAP_ADMIN_EMAIL configurado, nenhuma conta vira admin sozinha —
    não existe mais bootstrap implícito por "primeira conta criada"."""
    bootstrap_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    matches = bool(bootstrap_email) and email.strip().lower() == bootstrap_email
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    return matches, admin_exists


def _verify_bootstrap_token(provided: str | None) -> bool:
    expected = os.getenv("BOOTSTRAP_ADMIN_TOKEN", "").strip()
    return bool(expected) and bool(provided) and hmac.compare_digest(provided, expected)


@router.post("/register", response_model=CurrentUserRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db),
    x_bootstrap_admin_token: str | None = Header(default=None, alias="X-Bootstrap-Admin-Token"),
):
    if not _self_registration_allowed():
        raise HTTPException(status_code=403, detail="O cadastro de novas contas está desabilitado.")
    key = _throttle_key(request)
    try:
        _check_throttle(db, key, "register", REGISTER_WINDOW_SECONDS, MAX_REGISTER_ATTEMPTS)
    except HTTPException:
        _log_auth(request, "Cadastro temporariamente limitado por excesso de tentativas.", event="auth_register_throttled", outcome="denied")
        raise
    _record_throttle_event(db, key, "register")

    _require_privacy_consent(payload.privacy_consent)
    if db.query(User).filter(User.email == payload.email).first():
        _log_auth(request, "Cadastro recusado: e-mail já possui conta.", event="auth_register_denied", outcome="denied")
        raise HTTPException(status_code=409, detail="Já existe uma conta com este e-mail.")

    # E-mail de bootstrap: exige token secreto (só quem tem acesso ao painel
    # do Render conhece) e só funciona enquanto nenhum admin existir ainda.
    # Sem o token certo, a conta nem é criada — evita que alguém "reserve"
    # esse e-mail como conta comum e bloqueie o admin de verdade depois.
    is_bootstrap_email, admin_exists = _admin_bootstrap_match(db, payload.email)
    if is_bootstrap_email:
        if admin_exists or not _verify_bootstrap_token(x_bootstrap_admin_token):
            _log_auth(
                request, "Tentativa de cadastro no e-mail de administrador bootstrap negada.",
                event="auth_bootstrap_denied", outcome="denied",
            )
            raise HTTPException(status_code=403, detail="Não é possível criar conta com este e-mail. Peça um convite a um administrador.")
        role = "admin"
    else:
        role = "professor"

    user = User(
        name=payload.name.strip(), email=payload.email, password_hash=hash_password(payload.password),
        role=role, created_at=_now(),
    )
    _record_consent(user)
    db.add(user)
    db.flush()
    _create_session(db, user, response)
    db.refresh(user)
    if role == "admin":
        _log_auth(request, "Conta de administrador criada via bootstrap.", event="auth_bootstrap_admin_created", outcome="success", user=user)
    _log_auth(request, "Conta criada e sessão iniciada.", event="auth_register_success", outcome="success", user=user)
    return user


@router.post("/login", response_model=CurrentUserRead)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    key = _throttle_key(request, payload.email)
    try:
        _check_throttle(db, key, "login", LOGIN_WINDOW_SECONDS, MAX_LOGIN_FAILURES)
    except HTTPException:
        _log_auth(request, "Login temporariamente limitado por excesso de tentativas.", event="auth_login_throttled", outcome="denied")
        raise
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        _record_throttle_event(db, key, "login")
        _log_auth(request, "Login recusado: credenciais inválidas.", event="auth_login_denied", outcome="denied")
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    _clear_throttle(db, key, "login")
    _create_session(db, user, response)
    db.refresh(user)
    _log_auth(request, "Login por senha concluído.", event="auth_password_login_success", outcome="success", user=user)
    return user


@router.get("/google/available")
def google_available():
    return {"available": all(os.getenv(name, "").strip() for name in (
        "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI",
    ))}


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(payload: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    key = _throttle_key(request, payload.email)
    try:
        _check_throttle(db, key, "reset", RESET_WINDOW_SECONDS, MAX_RESET_REQUESTS)
    except HTTPException:
        _log_auth(request, "Solicitação de recuperação limitada por excesso de tentativas.", event="auth_reset_throttled", outcome="denied")
        raise
    _record_throttle_event(db, key, "reset")

    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        token = new_token()
        now = _now()
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).delete()
        db.add(PasswordResetToken(
            user_id=user.id, token_hash=hash_token(token), created_at=now,
            expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
        ))
        db.commit()
        reset_url = f"{_frontend_url()}/reset-password?{urllib.parse.urlencode({'token': token})}"
        try:
            send_password_reset_email(user.email, reset_url)
        except EmailDeliveryError:
            db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == hash_token(token)).delete()
            db.commit()
            _log_auth(request, "Solicitação de recuperação falhou na entrega de e-mail.", event="auth_reset_delivery_failed", outcome="error", user=user)
            raise HTTPException(status_code=503, detail="O serviço de recuperação está indisponível. Tente novamente mais tarde.")
        _log_auth(request, "Solicitação de recuperação de senha aceita.", event="auth_reset_requested", outcome="success", user=user)
    else:
        _log_auth(request, "Solicitação de recuperação processada sem conta correspondente.", event="auth_reset_requested", outcome="success")
    return {"message": "Se existir uma conta para este e-mail, enviaremos as instruções de recuperação."}


@router.post("/password-reset/confirm", response_model=CurrentUserRead)
def confirm_password_reset(payload: PasswordResetConfirm, request: Request, response: Response, db: Session = Depends(get_db)):
    now = _now()
    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == hash_token(payload.token),
        PasswordResetToken.used_at.is_(None),
    ).first()
    if not reset or reset.expires_at <= now:
        _log_auth(request, "Redefinição de senha recusada: token inválido ou expirado.", event="auth_reset_denied", outcome="denied")
        raise HTTPException(status_code=400, detail="Este link é inválido ou expirou. Solicite uma nova recuperação.")

    user = reset.user
    user.password_hash = hash_password(payload.new_password)
    reset.used_at = now
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    _create_session(db, user, response)
    db.refresh(user)
    _log_auth(request, "Senha redefinida; sessões anteriores foram revogadas.", event="auth_reset_success", outcome="success", user=user)
    return user


@router.get("/google/start")
def google_start(response: Response, privacy_consent: bool = Query(False)):
    _require_privacy_consent(privacy_consent)
    client_id, _, redirect_uri = _google_settings()
    state = new_token()
    response = RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }),
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        GOOGLE_STATE_COOKIE, f"{state}:1", max_age=600, httponly=True,
        secure=_cookie_secure(), samesite="lax", path="/",
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    fallback = f"{_frontend_url()}/?auth_error=google"
    state_cookie = request.cookies.get(GOOGLE_STATE_COOKIE, "")
    expected_state, _, consent = state_cookie.partition(":")
    if error or not code or not state or not hmac.compare_digest(expected_state, state):
        _log_auth(request, "Login Google recusado: retorno OAuth inválido ou cancelado.", event="auth_google_denied", outcome="denied")
        response = RedirectResponse(fallback, status_code=status.HTTP_303_SEE_OTHER)
        response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
        return response

    try:
        client_id, client_secret, redirect_uri = _google_settings()
        claims = id_token.verify_oauth2_token(
            _exchange_google_code(code, client_id, client_secret, redirect_uri),
            google_requests.Request(),
            client_id,
        )
        if not claims.get("email_verified") or not claims.get("sub") or not claims.get("email"):
            raise ValueError("Identidade Google sem e-mail verificado.")
        allowed_domain = os.getenv("GOOGLE_WORKSPACE_DOMAIN", "").strip().lower()
        if allowed_domain and claims.get("hd", "").lower() != allowed_domain:
            raise ValueError("Conta fora do domínio institucional permitido.")
    except (ValueError, HTTPException):
        _log_auth(request, "Login Google recusado: identidade não pôde ser validada.", event="auth_google_invalid", outcome="denied")
        response = RedirectResponse(fallback, status_code=status.HTTP_303_SEE_OTHER)
        response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
        return response

    subject = str(claims["sub"])
    email = str(claims["email"]).strip().lower()
    user = db.query(User).filter(User.google_subject == subject).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_subject = subject
        elif _self_registration_allowed() and consent == "1":
            # O Google já verificou a posse deste e-mail (email_verified), então
            # o match com BOOTSTRAP_ADMIN_EMAIL é confiável sem token adicional
            # — mas só enquanto nenhum admin existir ainda.
            is_bootstrap_email, admin_exists = _admin_bootstrap_match(db, email)
            role = "admin" if (is_bootstrap_email and not admin_exists) else "professor"
            user = User(
                name=str(claims.get("name") or email.split("@", 1)[0])[:120], email=email,
                google_subject=subject, role=role, created_at=_now(),
            )
            _record_consent(user)
            db.add(user)
            db.flush()
            if role == "admin":
                _log_auth(request, "Conta de administrador criada via bootstrap (Google).", event="auth_bootstrap_admin_created", outcome="success", user=user)
        else:
            _log_auth(request, "Login Google recusado: criação de conta indisponível.", event="auth_google_registration_denied", outcome="denied")
            response = RedirectResponse(fallback, status_code=status.HTTP_303_SEE_OTHER)
            response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
            return response

    response = RedirectResponse(_frontend_url(), status_code=status.HTTP_303_SEE_OTHER)
    _create_session(db, user, response)
    response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
    _log_auth(request, "Login Google concluído.", event="auth_google_login_success", outcome="success", user=user)
    return response


@router.get("/me", response_model=CurrentUserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/export", response_model=PrivacyExportRead)
def export_my_data(user: User = Depends(get_current_user)):
    methods = ["senha"] if user.password_hash else []
    if user.google_subject:
        methods.append("google")
    return PrivacyExportRead(
        name=user.name, email=user.email, role=user.role, created_at=user.created_at,
        last_login_at=user.last_login_at, privacy_accepted_at=user.privacy_accepted_at,
        privacy_policy_version=user.privacy_policy_version, authentication_methods=methods,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    request: Request, response: Response, user: User = Depends(get_current_user),
    _: None = Depends(require_csrf), db: Session = Depends(get_db),
):
    actor_id = user.id
    db.delete(user)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    _log_auth(request, "Conta removida por solicitação do titular.", event="privacy_account_deleted", outcome="success")
    logger.info("Exclusão de dados de conta concluída.", extra={"event": "privacy_account_deleted", "actor_id": actor_id, "outcome": "success"})


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request, response: Response, user: User = Depends(get_current_user),
    _: None = Depends(require_csrf), db: Session = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.token_hash == hash_token(token)).delete()
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    _log_auth(request, "Logout concluído e sessão revogada.", event="auth_logout", outcome="success", user=user)
