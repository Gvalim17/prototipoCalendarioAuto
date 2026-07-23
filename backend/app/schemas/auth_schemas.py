from datetime import datetime
import re

from pydantic import BaseModel, Field, field_validator


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=12, max_length=256)
    privacy_consent: bool

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Informe um e-mail válido.")
        return email


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class CurrentUserRead(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime
    privacy_policy_version: str | None = None

    class Config:
        from_attributes = True


class PrivacyExportRead(BaseModel):
    name: str
    email: str
    role: str
    created_at: datetime
    last_login_at: datetime | None = None
    privacy_accepted_at: datetime | None = None
    privacy_policy_version: str | None = None
    authentication_methods: list[str]


class PasswordResetRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=32, max_length=256)
    new_password: str = Field(..., min_length=12, max_length=256)


VALID_ROLES = {"admin", "professor"}


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class UserInvite(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=254)
    role: str = Field("professor")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Informe um e-mail válido.")
        return email

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in VALID_ROLES:
            raise ValueError("Papel inválido.")
        return value


class UserRoleUpdate(BaseModel):
    role: str = Field(...)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in VALID_ROLES:
            raise ValueError("Papel inválido.")
        return value
