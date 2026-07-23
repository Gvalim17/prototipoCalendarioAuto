from datetime import datetime

from pydantic import BaseModel, Field


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
