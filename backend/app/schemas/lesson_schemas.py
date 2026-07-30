import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# --- Plano de Trabalho Docente (PTD) — por disciplina ---
class LessonPlanUpdate(BaseModel):
    ementa: str | None = Field(None, max_length=8000)
    objetivos: str | None = Field(None, max_length=8000)
    conteudo_programatico: str | None = Field(None, max_length=8000)
    metodologia: str | None = Field(None, max_length=8000)
    recursos_didaticos: str | None = Field(None, max_length=8000)
    criterios_avaliacao: str | None = Field(None, max_length=8000)
    bibliografia: str | None = Field(None, max_length=8000)
    notes: str | None = Field(None, max_length=20000)


class LessonPlanRead(LessonPlanUpdate):
    id: int
    discipline_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Roteiro de aula — por ScheduledClass ---
class LessonScriptUpdate(BaseModel):
    topic: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=20000)


class LessonAttachmentRead(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class LessonScriptRead(LessonScriptUpdate):
    id: int
    scheduled_class_id: int
    created_at: datetime
    updated_at: datetime
    attachments: list[LessonAttachmentRead] = []

    class Config:
        from_attributes = True


# --- Link público de compartilhamento (só anexos, expira em 7 dias) ---
class ShareLinkRead(BaseModel):
    active: bool
    url: str | None = None
    expires_at: datetime | None = None


class ShareLinkCreated(ShareLinkRead):
    token: str


# --- Envio de material por e-mail ---
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SendLessonEmailRequest(BaseModel):
    recipients: list[str] = Field(..., min_length=1, max_length=30)
    message: str | None = Field(None, max_length=2000)

    @field_validator("recipients")
    @classmethod
    def _validate_recipients(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value if v.strip()]
        if not cleaned:
            raise ValueError("Informe ao menos um destinatário.")
        for email in cleaned:
            if not re.match(EMAIL_PATTERN, email) or len(email) > 254:
                raise ValueError(f"E-mail inválido: {email}")
        return cleaned


# --- Página pública de materiais (sem login, via token) ---
class PublicAttachmentRead(BaseModel):
    id: int
    filename: str
    size_bytes: int


class PublicLessonMaterialsRead(BaseModel):
    discipline_name: str
    course_name: str
    date: str
    topic: str | None = None
    attachments: list[PublicAttachmentRead]
