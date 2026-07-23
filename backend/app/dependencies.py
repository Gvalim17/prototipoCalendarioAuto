import os
from datetime import datetime, timezone

from fastapi import Cookie, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models.base import Course, Discipline, Module, User, UserSession
from .security import hash_token
from .schemas.base_schemas import ScheduleConfigBase


def get_current_user(
    request: Request,
    calendario_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not calendario_session:
        raise HTTPException(status_code=401, detail="Autenticação obrigatória.")
    session = db.query(UserSession).filter(
        UserSession.token_hash == hash_token(calendario_session)
    ).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if not session or session.expires_at <= now:
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=401, detail="Sua sessão expirou. Entre novamente.")
    session.last_seen_at = now
    db.commit()
    request.state.user_id = session.user_id
    request.state.session = session
    return session.user


def require_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Ação restrita a administradores.")
    return user


def require_admin_action(
    user: User = Depends(require_admin_user),
    x_admin_action_token: str | None = Header(default=None),
) -> None:
    expected = os.getenv("ADMIN_ACTION_TOKEN", "").strip()
    if expected and x_admin_action_token != expected:
        raise HTTPException(status_code=403, detail="Token administrativo inválido.")


def require_csrf(
    request: Request,
    calendario_csrf: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if not calendario_csrf or not x_csrf_token or calendario_csrf != x_csrf_token:
        raise HTTPException(status_code=403, detail="Validação de segurança da sessão falhou.")
    session_token = request.cookies.get("calendario_session")
    session = db.query(UserSession).filter(
        UserSession.token_hash == hash_token(session_token or "")
    ).first()
    if not session or session.csrf_token_hash != hash_token(x_csrf_token):
        raise HTTPException(status_code=403, detail="Validação de segurança da sessão falhou.")


def get_course_or_404(db: Session, course_id: int) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Curso não encontrado")
    return course


def ensure_owner_or_admin(owner_id: int | None, user: User) -> None:
    if owner_id is not None and owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Este cronograma pertence a outro professor.")


def get_module_or_404(db: Session, module_id: int) -> Module:
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    return module


def get_discipline_or_404(db: Session, discipline_id: int) -> Discipline:
    discipline = db.query(Discipline).filter(Discipline.id == discipline_id).first()
    if not discipline:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada")
    return discipline


def validate_schedule_references(db: Session, config: ScheduleConfigBase) -> None:
    get_course_or_404(db, config.course_id)
    module = get_module_or_404(db, config.module_id)
    discipline = get_discipline_or_404(db, config.discipline_id)

    if module.course_id != config.course_id:
        raise HTTPException(status_code=422, detail="O módulo informado não pertence ao curso selecionado.")
    if discipline.module_id != config.module_id:
        raise HTTPException(status_code=422, detail="A disciplina informada não pertence ao módulo selecionado.")
