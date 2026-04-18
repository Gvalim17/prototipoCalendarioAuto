from pydantic import BaseModel, Field
from datetime import date
from typing import List, Literal, Optional
from ..models.base import DeliveryFormat, RecurrenceType

# --- MBA ---
class MBABase(BaseModel):
    name: str
    description: Optional[str] = None
    year: int = 2026

class MBACreate(MBABase):
    pass

class MBARead(MBABase):
    id: int
    modules: List['ModuleRead'] = []
    class Config:
        from_attributes = True

class MBAUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    year: Optional[int] = None

# --- Module ---
class ModuleBase(BaseModel):
    name: str
    mba_id: int

class ModuleCreate(ModuleBase):
    pass

class ModuleRead(ModuleBase):
    id: int
    disciplines: List['DisciplineRead'] = []
    class Config:
        from_attributes = True

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    mba_id: Optional[int] = None

# --- Discipline ---
class DisciplineBase(BaseModel):
    name: str
    code: str
    module_id: int

class DisciplineCreate(DisciplineBase):
    pass

class DisciplineRead(DisciplineBase):
    id: int
    class Config:
        from_attributes = True

class DisciplineUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    module_id: Optional[int] = None

# --- Holiday ---
class HolidayBase(BaseModel):
    date: date
    description: str
    type: str = "nacional"
    source: str = "Institucional"

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
    source: str = "Institucional"

class RecessCreate(RecessBase):
    pass

class RecessRead(RecessBase):
    id: int
    class Config:
        from_attributes = True

# --- Schedule Configuration & Response ---
class ScheduleConfigBase(BaseModel):
    mba_id: int
    module_id: int
    discipline_id: int
    format: DeliveryFormat
    workload: int
    start_date: date
    recurrence: RecurrenceType
    day_of_week: int = Field(..., ge=0, le=6, description="0=Segunda, 6=Domingo")
    num_classes: int

class SkippedDate(BaseModel):
    date: date
    reason: str
    suggested_date: Optional[date] = None

class ConflictResolution(BaseModel):
    original_date: date
    action: str  # "auto" | "manual"
    resolved_date: date

class ResolveConflictsRequest(BaseModel):
    config: ScheduleConfigBase
    resolutions: List[ConflictResolution]

class ResolvedScheduleResponse(BaseModel):
    dates: List[date]
    config: ScheduleConfigBase

class ScheduleResponse(BaseModel):
    dates: List[date]
    skipped: List[SkippedDate]
    config: ScheduleConfigBase

# --- Persistence ---
class ScheduledClassCreate(BaseModel):
    date: date
    order: int

class FullScheduleCreate(BaseModel):
    config: ScheduleConfigBase
    classes: List[ScheduledClassCreate]

class ScheduledClassRead(BaseModel):
    id: int
    date: date
    order: int
    class Config:
        from_attributes=True

class CalendarEventRead(BaseModel):
    id: int
    date: date
    order: int
    mba_name: str
    discipline_name: str
    color: Optional[str] = "blue"
    
    class Config:
        from_attributes=True

class FullScheduleRead(BaseModel):
    id: int
    mba_id: int
    module_id: int
    discipline_id: int
    classes: List[ScheduledClassRead]
    class Config:
        from_attributes = True

class PreviewExportRequest(BaseModel):
    mba_name: str
    module_name: str
    discipline_name: str
    format: str
    workload: int
    dates: List[date]
    recurrence: str
