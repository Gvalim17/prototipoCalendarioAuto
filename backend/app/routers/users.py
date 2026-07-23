from datetime import timedelta
from typing import List
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin_user
from ..logging_config import get_logger
from ..models.base import PasswordResetToken, User
from ..schemas.auth_schemas import UserInvite, UserRead, UserRoleUpdate
from ..security import hash_token, new_token
from ..services.email_service import EmailDeliveryError, send_password_reset_email
from .auth import RESET_TOKEN_MINUTES, _frontend_url, _now


router = APIRouter(prefix="/users", tags=["Usuários"], dependencies=[Depends(require_admin_user)])
logger = get_logger()


@router.get("/", response_model=List[UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at).all()


@router.post("/", response_model=UserRead, status_code=201)
def invite_user(payload: UserInvite, db: Session = Depends(get_db), admin: User = Depends(get_current_user)):
    """Cria a conta sem senha e envia um link de definição de senha (reaproveita
    o fluxo de recuperação já existente) — é assim que novos professores
    entram no sistema depois que o auto-cadastro é desligado."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Já existe uma conta com este e-mail.")

    user = User(name=payload.name.strip(), email=payload.email, role=payload.role, created_at=_now())
    db.add(user)
    db.flush()

    token = new_token()
    now = _now()
    db.add(PasswordResetToken(
        user_id=user.id, token_hash=hash_token(token), created_at=now,
        expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
    ))
    db.commit()

    reset_url = f"{_frontend_url()}/reset-password?{urlencode({'token': token})}"
    try:
        send_password_reset_email(user.email, reset_url)
    except EmailDeliveryError:
        db.delete(user)
        db.commit()
        raise HTTPException(status_code=503, detail="Não foi possível enviar o convite por e-mail.")

    logger.info(
        f"Usuário convidado: {user.email} papel={user.role}",
        extra={"event": "user_invited", "actor_id": admin.id, "outcome": "success"},
    )
    db.refresh(user)
    return user


@router.patch("/{user_id}/role", response_model=UserRead)
def update_role(user_id: int, payload: UserRoleUpdate, db: Session = Depends(get_db), admin: User = Depends(get_current_user)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if target.id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=422, detail="Você não pode remover seu próprio acesso de administrador.")
    if payload.role != "admin" and target.role == "admin":
        remaining_admins = db.query(User).filter(User.role == "admin", User.id != target.id).count()
        if remaining_admins == 0:
            raise HTTPException(status_code=422, detail="É necessário manter ao menos um administrador.")

    target.role = payload.role
    db.commit()
    db.refresh(target)
    logger.warning(
        f"Papel alterado: usuário={target.id} novo_papel={payload.role}",
        extra={"event": "user_role_changed", "actor_id": admin.id, "outcome": "success"},
    )
    return target


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_user)):
    if user_id == admin.id:
        raise HTTPException(status_code=422, detail="Use a exclusão da própria conta em Configurações.")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if target.role == "admin":
        remaining = db.query(User).filter(User.role == "admin", User.id != user_id).count()
        if remaining == 0:
            raise HTTPException(status_code=422, detail="É necessário manter ao menos um administrador.")

    email = target.email
    db.delete(target)
    db.commit()
    logger.warning(
        f"Usuário removido: id={user_id} email={email}",
        extra={"event": "user_deleted", "actor_id": admin.id, "outcome": "success"},
    )
    return None
