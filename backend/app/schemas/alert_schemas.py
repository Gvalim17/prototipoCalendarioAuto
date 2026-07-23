from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AlertPreferenceUpdate(BaseModel):
    enabled: bool = True
    minutes_before: list[int] = Field(default_factory=lambda: [1440, 60], max_length=4)
    in_app_enabled: bool = True
    email_enabled: bool = False
    timezone: str = Field("America/Sao_Paulo", min_length=1, max_length=64)

    @field_validator("minutes_before")
    @classmethod
    def validate_offsets(cls, values: list[int]) -> list[int]:
        offsets = sorted(set(values), reverse=True)
        if not offsets or any(value < 5 or value > 7 * 24 * 60 for value in offsets):
            raise ValueError("Escolha alertas entre 5 minutos e 7 dias antes da aula.")
        return offsets


class AlertPreferenceRead(AlertPreferenceUpdate):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("minutes_before", mode="before")
    @classmethod
    def parse_offsets(cls, value):
        if isinstance(value, str):
            return [int(item) for item in value.split(",") if item.strip().isdigit()]
        return value


class AlertNotificationRead(BaseModel):
    id: int
    channel: str
    minutes_before: int
    status: str
    title: str
    body: str
    scheduled_for: datetime
    sent_at: datetime | None = None
    read_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CalendarTokenRead(BaseModel):
    has_token: bool
