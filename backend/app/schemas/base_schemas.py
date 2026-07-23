from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import date, time
from typing import List, Literal, Optional
from ..models.base import DeliveryFormat, RecurrenceType, AcademicLevel, HolidayPolicy, ScheduledClassStatus

# --- Course ---
class CourseBase(BaseModel):
    name: str = Field(..., min_length=1)
    institution: Optional[str] = None
    academic_level: AcademicLevel = AcademicLevel.MBA
    academic_level_other: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    year: int = Field(2026, ge=1900, le=2200)
    semester: Optional[int] = Field(None, ge=1, le=2)

    @model_validator(mode="after")
    def _validate_other_level(self):
        if self.academic_level == AcademicLevel.OUTRO and not self.academic_level_other:
            raise ValueError("Informe o nome do nível acadêmico em 'Outro'.")
        return self

class CourseCreate(CourseBase):
    pass

class CourseRead(CourseBase):
    id: int
    modules: List['ModuleRead'] = []
    class Config:
        from_attributes = True

class CourseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    institution: Optional[str] = None
    academic_level: Optional[AcademicLevel] = None
    academic_level_other: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    year: Optional[int] = Field(None, ge=1900, le=2200)
    semester: Optional[int] = Field(None, ge=1, le=2)

# --- Module ---
class ModuleBase(BaseModel):
    name: str = Field(..., min_length=1)
    course_id: int = Field(..., gt=0)

class ModuleCreate(ModuleBase):
    pass

class ModuleRead(ModuleBase):
    id: int
    disciplines: List['DisciplineRead'] = []
    class Config:
        from_attributes = True

class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    course_id: Optional[int] = Field(None, gt=0)

# --- Discipline ---
class DisciplineBase(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    module_id: int = Field(..., gt=0)

class DisciplineCreate(DisciplineBase):
    pass

class DisciplineRead(DisciplineBase):
    id: int
    class Config:
        from_attributes = True

class DisciplineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    code: Optional[str] = Field(None, min_length=1)
    module_id: Optional[int] = Field(None, gt=0)

# --- Holiday ---
class HolidayBase(BaseModel):
    date: date
    description: str = Field(..., min_length=1)
    type: str = Field("nacional", min_length=1)
    source: str = Field("Institucional", min_length=1)

class HolidayCreate(HolidayBase):
    pass

class HolidayRead(HolidayBase):
    id: int
    class Config:
        from_attributes = True

# --- Recess ---
class RecessBase(BaseModel):
    start_date: date
    end_date: date
    description: Optional[str] = None
    source: str = Field("Institucional", min_length=1)

class RecessCreate(RecessBase):
    pass

class RecessRead(RecessBase):
    id: int
    class Config:
        from_attributes = True

# --- Schedule Configuration & Response ---
class ScheduleConfigBase(BaseModel):
    course_id: int = Field(..., gt=0)
    module_id: int = Field(..., gt=0)
    discipline_id: int = Field(..., gt=0)
    format: DeliveryFormat
    start_date: date
    end_date: Optional[date] = None
    recurrence: RecurrenceType
    days_of_week: List[int] = Field(default_factory=list, description="0=Segunda … 6=Domingo")
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    holiday_policy: HolidayPolicy = HolidayPolicy.RESCHEDULE

    @field_validator("days_of_week")
    @classmethod
    def _valid_days(cls, v: List[int]) -> List[int]:
        for d in v:
            if d < 0 or d > 6:
                raise ValueError("Dias da semana devem estar entre 0 (Segunda) e 6 (Domingo).")
        # remove duplicados preservando ordem
        seen: set = set()
        return [d for d in v if not (d in seen or seen.add(d))]

    @model_validator(mode="after")
    def _validate_rules(self):
        if self.recurrence != RecurrenceType.NA and not self.days_of_week:
            raise ValueError("Selecione ao menos um dia da semana para recorrência semanal/quinzenal.")
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("A data de fim deve ser igual ou posterior à data de início.")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("O horário de término deve ser posterior ao horário de início.")
        return self

    @property
    def class_hours(self) -> float:
        if not self.start_time or not self.end_time:
            return 0.0
        start_min = self.start_time.hour * 60 + self.start_time.minute
        end_min = self.end_time.hour * 60 + self.end_time.minute
        return round((end_min - start_min) / 60, 2)

class SkippedDate(BaseModel):
    date: date
    reason: str
    suggested_date: Optional[date] = None

class ConflictResolution(BaseModel):
    original_date: date
    action: Literal["auto", "manual", "recalculate"]
    resolved_date: date

class ResolveConflictsRequest(BaseModel):
    config: ScheduleConfigBase
    resolutions: List[ConflictResolution]

class ResolvedScheduleResponse(BaseModel):
    dates: List[date]
    config: ScheduleConfigBase
    num_classes: int = 0
    total_workload: float = 0.0

class ScheduleResponse(BaseModel):
    dates: List[date]
    skipped: List[SkippedDate]
    config: ScheduleConfigBase
    num_classes: int = 0
    total_workload: float = 0.0

# --- Persistence ---
class ScheduledClassCreate(BaseModel):
    date: date
    order: int = Field(..., gt=0)

class ScheduledClassUpdate(BaseModel):
    """Edição pontual de uma aula: troca de data ou cancelamento. O motivo é
    sempre obrigatório e nenhuma das duas ações é bloqueada por feriado/recesso
    — a decisão de alterar um dia de aula ou cancelar é sempre do professor."""
    date: date
    reason: str = Field(..., min_length=3, max_length=500)
    cancelled: bool = False

# --- Conflict check (mesmo professor, outra aula no mesmo dia) ---
class ScheduleConflictItem(BaseModel):
    date: date
    course_name: str
    discipline_name: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None

class ScheduleConflictCheckRequest(BaseModel):
    dates: List[date]
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    exclude_config_id: Optional[int] = None

class ScheduleConflictCheckResponse(BaseModel):
    overlaps: List[ScheduleConflictItem] = []
    near: List[ScheduleConflictItem] = []

class FullScheduleCreate(BaseModel):
    config: ScheduleConfigBase
    classes: List[ScheduledClassCreate]

class ScheduledClassRead(BaseModel):
    id: int
    date: date
    order: int
    status: ScheduledClassStatus
    change_reason: Optional[str] = None
    class Config:
        from_attributes=True

class CalendarEventRead(BaseModel):
    id: int
    date: date
    order: int
    discipline_id: int
    format: str
    course_name: str
    academic_level: Optional[str] = None
    academic_level_label: Optional[str] = None
    discipline_name: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    color: Optional[str] = None

    class Config:
        from_attributes=True

class ScheduleConfigRead(ScheduleConfigBase):
    id: int
    course_name: str
    module_name: str
    discipline_name: str
    institution: Optional[str] = None
    academic_level: Optional[AcademicLevel] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    num_classes: Optional[int] = None
    workload: Optional[int] = None

class FullScheduleRead(BaseModel):
    id: int
    course_id: int
    module_id: int
    discipline_id: int
    num_classes: Optional[int] = None
    workload: Optional[int] = None
    classes: List[ScheduledClassRead]
    class Config:
        from_attributes = True

class StatsRead(BaseModel):
    courses: int
    modules: int
    disciplines: int
    scheduled_classes: int

class PreviewExportRequest(BaseModel):
    course_name: str
    module_name: str
    discipline_name: str
    format: str
    dates: List[date]
    recurrence: str
    institution: Optional[str] = None
    academic_level: Optional[str] = None
    semester: Optional[int] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    workload: Optional[float] = None

# --- Logs ---
class LogEntry(BaseModel):
    time: str
    level: str
    logger: str
    message: str
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[float] = None
    client: Optional[str] = None
    event: Optional[str] = None
    request_id: Optional[str] = None
    actor_id: Optional[int] = None
    outcome: Optional[str] = None
    resource: Optional[str] = None
    exception: Optional[str] = None
