from typing import List
import io
import re

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager, joinedload

from ..database import get_db
from ..dependencies import (
    ensure_owner_or_admin, get_current_user, rate_limit_user, require_admin_action, validate_schedule_references,
)
from ..logging_config import get_logger
from ..models.base import (
    AcademicLevel, Course, DeliveryFormat, Discipline, Holiday, HolidayPolicy,
    Module, RecurrenceType, ScheduleConfig, ScheduledClass, ScheduledClassStatus, User,
)
from ..services.schedule_importer import parse_schedule_file
from ..schemas.base_schemas import (
    CalendarEventRead,
    FullScheduleCreate,
    FullScheduleRead,
    PreviewExportRequest,
    ResolveConflictsRequest,
    ResolvedScheduleResponse,
    ScheduleConfigBase,
    ScheduleConfigRead,
    ScheduleConflictCheckRequest,
    ScheduleConflictCheckResponse,
    ScheduleConflictItem,
    ScheduledClassRead,
    ScheduledClassUpdate,
    ScheduleResponse,
    ModalityBreakdown,
    ReportBreakdownItem,
    ReportsRead,
    ScheduleImportResult,
    StatsRead,
)
from ..services.schedule_generator import ScheduleGeneratorService


router = APIRouter()
logger = get_logger()
DAYS_PT = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]

# Paleta categórica por disciplina — cor consistente para a mesma disciplina
# em qualquer visualização do calendário, evitando que aulas de disciplinas
# diferentes fiquem visualmente idênticas.
DISCIPLINE_PALETTE = [
    "#0f766e",  # teal
    "#7c3aed",  # roxo
    "#b45309",  # âmbar
    "#be123c",  # vinho
    "#4d7c0f",  # verde-oliva
    "#4338ca",  # índigo
    "#c2410c",  # terracota
    "#0369a1",  # azul-petróleo
    "#a21caf",  # magenta
    "#65a30d",  # verde-lima
    "#9333ea",  # violeta
    "#b91c1c",  # vermelho-telha
]


def _discipline_color(discipline_id: int) -> str:
    return DISCIPLINE_PALETTE[discipline_id % len(DISCIPLINE_PALETTE)]


def _level_label(course) -> str:
    if course.academic_level.value == "outro" and course.academic_level_other:
        return course.academic_level_other
    return course.academic_level.value.replace("_", " ").title()


def _config_to_orm(config: ScheduleConfigBase, owner_id: int | None = None) -> ScheduleConfig:
    """Converte o schema em modelo ORM (days_of_week -> CSV)."""
    data = config.model_dump()
    days = data.get("days_of_week") or []
    data["days_of_week"] = ",".join(str(d) for d in days)
    if owner_id is not None:
        data["owner_id"] = owner_id
    return ScheduleConfig(**data)


def _fmt_time(t) -> str:
    return t.strftime("%H:%M") if t else ""


def _config_to_read(db_config: ScheduleConfig) -> dict:
    """Converte o modelo ORM para o shape editável no frontend (days_of_week
    volta a ser lista, e os nomes de curso/módulo/disciplina são incluídos
    para exibição sem precisar de requisições extras)."""
    return {
        "id": db_config.id,
        "course_id": db_config.course_id,
        "module_id": db_config.module_id,
        "discipline_id": db_config.discipline_id,
        "format": db_config.format,
        "start_date": db_config.start_date,
        "end_date": db_config.end_date,
        "recurrence": db_config.recurrence,
        "days_of_week": db_config.days_list,
        "start_time": db_config.start_time,
        "end_time": db_config.end_time,
        "holiday_policy": db_config.holiday_policy,
        "event_title": db_config.event_title,
        "num_classes": db_config.num_classes,
        "workload": db_config.workload,
        "course_name": db_config.course.name,
        "module_name": db_config.module.name,
        "discipline_name": db_config.discipline.name,
        "institution": db_config.course.institution,
        "academic_level": db_config.course.academic_level,
        "owner_id": db_config.owner_id,
        "owner_name": db_config.owner.name if db_config.owner else None,
    }


@router.get("/stats/", response_model=StatsRead)
def get_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    courses_q = db.query(Course)
    modules_q = db.query(Module)
    disciplines_q = db.query(Discipline)
    classes_q = db.query(ScheduledClass).join(ScheduleConfig)
    if user.role != "admin":
        courses_q = courses_q.filter(Course.owner_id == user.id)
        modules_q = modules_q.filter(Module.owner_id == user.id)
        disciplines_q = disciplines_q.filter(Discipline.owner_id == user.id)
        classes_q = classes_q.filter(ScheduleConfig.owner_id == user.id)
    return StatsRead(
        courses=courses_q.count(),
        modules=modules_q.count(),
        disciplines=disciplines_q.count(),
        scheduled_classes=classes_q.count(),
    )


@router.get("/reports/", response_model=ReportsRead)
def get_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .options(
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.course),
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.discipline),
        )
    )
    if user.role != "admin":
        query = query.filter(ScheduleConfig.owner_id == user.id)
    classes = query.all()

    total_hours = 0.0
    discipline_stats: dict[str, dict] = {}
    institution_stats: dict[str, dict] = {}
    modality = ModalityBreakdown()

    for sc in classes:
        cfg = sc.config
        hours = 0.0
        if cfg.start_time and cfg.end_time:
            start_minutes = cfg.start_time.hour * 60 + cfg.start_time.minute
            end_minutes = cfg.end_time.hour * 60 + cfg.end_time.minute
            hours = max(0.0, (end_minutes - start_minutes) / 60)
        total_hours += hours

        disc_name = cfg.discipline.name
        d = discipline_stats.setdefault(disc_name, {"classes": 0, "hours": 0.0})
        d["classes"] += 1
        d["hours"] += hours

        institution = cfg.course.institution or "Sem instituição"
        i = institution_stats.setdefault(institution, {"classes": 0, "hours": 0.0})
        i["classes"] += 1
        i["hours"] += hours

        if cfg.format == DeliveryFormat.PRESENCIAL:
            modality.presencial += 1
        else:
            modality.remoto += 1

    def _top(stats: dict[str, dict], limit: int = 10) -> list:
        items = [ReportBreakdownItem(label=k, classes=v["classes"], hours=round(v["hours"], 2)) for k, v in stats.items()]
        return sorted(items, key=lambda x: x.classes, reverse=True)[:limit]

    return ReportsRead(
        total_classes=len(classes),
        total_hours=round(total_hours, 2),
        by_discipline=_top(discipline_stats),
        by_institution=_top(institution_stats),
        by_modality=modality,
    )


def _holiday_warnings_for(db: Session, dates: list) -> list:
    holidays = {h.date: h.description for h in db.query(Holiday).all()}
    return ScheduleGeneratorService.find_holiday_adjacency_warnings(dates, holidays)


@router.post(
    "/generate-schedule/",
    response_model=ScheduleResponse,
    dependencies=[Depends(rate_limit_user("generate_schedule", max_events=30, window_seconds=60))],
)
def generate_schedule(config: ScheduleConfigBase, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        validate_schedule_references(db, config, user)
        cfg_model = _config_to_orm(config)
        result = ScheduleGeneratorService.generate_schedule(db, cfg_model)

        num_classes = len(result["dates"])
        total_workload = round(num_classes * config.class_hours, 2)
        return ScheduleResponse(
            dates=result["dates"],
            skipped=result["skipped"],
            config=config,
            num_classes=num_classes,
            total_workload=total_workload,
            holiday_warnings=_holiday_warnings_for(db, result["dates"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve-conflicts/", response_model=ResolvedScheduleResponse, include_in_schema=False)
@router.post("/schedules/resolve-conflicts/", response_model=ResolvedScheduleResponse)
def resolve_schedule_conflicts(request: ResolveConflictsRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        validate_schedule_references(db, request.config, user)
        cfg_model = _config_to_orm(request.config)
        resolutions = [r.model_dump() for r in request.resolutions]
        result = ScheduleGeneratorService.resolve_conflicts(db, cfg_model, resolutions)

        num_classes = len(result["dates"])
        total_workload = round(num_classes * request.config.class_hours, 2)
        return ResolvedScheduleResponse(
            dates=result["dates"],
            config=request.config,
            num_classes=num_classes,
            total_workload=total_workload,
            holiday_warnings=_holiday_warnings_for(db, result["dates"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


NEAR_CONFLICT_MINUTES = 30


def _to_minutes(t) -> int:
    return t.hour * 60 + t.minute


@router.post("/schedules/check-conflicts", response_model=ScheduleConflictCheckResponse)
def check_schedule_conflicts(
    request: ScheduleConflictCheckRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Avisa (sem bloquear) quando o professor já tem outra aula no mesmo dia
    que se sobrepõe (`overlaps`) ou fica a menos de 30 min (`near`) do horário
    informado. A decisão de salvar mesmo assim é do professor, no frontend."""
    if not request.dates or not request.start_time or not request.end_time:
        return ScheduleConflictCheckResponse(overlaps=[], near=[])

    query = (
        db.query(ScheduledClass, ScheduleConfig, Course, Discipline)
        .join(ScheduleConfig, ScheduledClass.config_id == ScheduleConfig.id)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .filter(ScheduleConfig.owner_id == user.id)
        .filter(ScheduledClass.date.in_(request.dates))
        .filter(ScheduledClass.status == ScheduledClassStatus.SCHEDULED)
    )
    if request.exclude_config_id is not None:
        query = query.filter(ScheduleConfig.id != request.exclude_config_id)

    new_start, new_end = _to_minutes(request.start_time), _to_minutes(request.end_time)
    overlaps: list[ScheduleConflictItem] = []
    near: list[ScheduleConflictItem] = []
    for sc, cfg, course, discipline in query.all():
        if not cfg.start_time or not cfg.end_time:
            continue
        other_start, other_end = _to_minutes(cfg.start_time), _to_minutes(cfg.end_time)
        item = ScheduleConflictItem(
            date=sc.date, course_name=course.name, discipline_name=discipline.name,
            start_time=cfg.start_time, end_time=cfg.end_time,
        )
        if other_start < new_end and new_start < other_end:
            overlaps.append(item)
        else:
            gap = min(abs(other_start - new_end), abs(new_start - other_end))
            if gap < NEAR_CONFLICT_MINUTES:
                near.append(item)

    return ScheduleConflictCheckResponse(overlaps=overlaps, near=near)


@router.post("/schedules/", response_model=FullScheduleRead)
def save_schedule(
    schedule_data: FullScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_schedule_references(db, schedule_data.config, user)
    if not schedule_data.classes:
        raise HTTPException(status_code=422, detail="O cronograma precisa ter pelo menos uma aula.")

    try:
        db_config = _config_to_orm(schedule_data.config, owner_id=user.id)
        db_config.num_classes = len(schedule_data.classes)
        db_config.workload = round(len(schedule_data.classes) * schedule_data.config.class_hours)
        db.add(db_config)
        db.flush()

        for cls in schedule_data.classes:
            db.add(ScheduledClass(
                config_id=db_config.id,
                date=cls.date,
                order=cls.order,
            ))

        db.commit()
        db.refresh(db_config)
        logger.info(
            f"Cronograma salvo: config_id={db_config.id} curso={db_config.course_id} "
            f"disciplina={db_config.discipline_id} aulas={db_config.num_classes}",
            extra={"event": "schedule_saved"},
        )
        return db_config
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao salvar cronograma: {e}", extra={"event": "schedule_save_failed"}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao salvar cronograma: {str(e)}")


def _generate_discipline_code(db: Session, name: str, owner_id: int | None) -> str:
    letters = re.findall(r"[A-Za-zÀ-ÿ0-9]+", name)
    base = "".join(w[0] for w in letters).upper()[:8] or "DISC"
    candidate = base
    suffix = 1
    while db.query(Discipline).filter(Discipline.owner_id == owner_id, Discipline.code == candidate).first():
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def _find_or_create_course(db: Session, user: User, group) -> Course:
    course = db.query(Course).filter(Course.owner_id == user.id, Course.name == group.course_name).first()
    if course:
        return course
    course = Course(
        name=group.course_name, owner_id=user.id,
        institution=group.institution or None,
        academic_level=AcademicLevel(group.academic_level),
        academic_level_other=group.academic_level_other,
        semester=group.semester,
        year=group.classes[0].date.year if group.classes else 2026,
    )
    db.add(course)
    db.flush()
    return course


def _find_or_create_module(db: Session, user: User, course: Course, name: str) -> Module:
    module = db.query(Module).filter(Module.owner_id == user.id, Module.course_id == course.id, Module.name == name).first()
    if module:
        return module
    module = Module(name=name, course_id=course.id, owner_id=user.id)
    db.add(module)
    db.flush()
    return module


def _find_or_create_discipline(db: Session, user: User, module: Module, name: str) -> Discipline:
    discipline = (
        db.query(Discipline)
        .filter(Discipline.owner_id == user.id, Discipline.module_id == module.id, Discipline.name == name)
        .first()
    )
    if discipline:
        return discipline
    discipline = Discipline(name=name, code=_generate_discipline_code(db, name, user.id), module_id=module.id, owner_id=user.id)
    db.add(discipline)
    db.flush()
    return discipline


@router.post(
    "/schedules/import/xlsx",
    response_model=ScheduleImportResult,
    dependencies=[Depends(rate_limit_user("import_schedule", max_events=10, window_seconds=60))],
)
async def import_schedules_xlsx(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Importa cronogramas de uma planilha (mesmo layout do /schedules/export/xlsx).
    Cada linha é uma aula; linhas com o mesmo curso/módulo/disciplina/formato/
    horário viram um único cronograma. Cursos, módulos e disciplinas já
    existentes (por nome, no catálogo do próprio professor) são reaproveitados
    em vez de duplicados."""
    try:
        content = await file.read()
        parsed = parse_schedule_file(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    errors: list[dict] = list(parsed["errors"])
    imported_configs = 0
    imported_classes = 0
    skipped_groups = 0

    for group in parsed["groups"]:
        if not group.classes:
            continue
        try:
            course = _find_or_create_course(db, user, group)
            module = _find_or_create_module(db, user, course, group.module_name)
            discipline = _find_or_create_discipline(db, user, module, group.discipline_name)

            dates = [c.date for c in group.classes]
            start_time = next((c.start_time for c in group.classes if c.start_time), None)
            end_time = next((c.end_time for c in group.classes if c.end_time), None)
            weekdays = sorted({d.weekday() for d in dates})
            recurrence = RecurrenceType.NA if len(group.classes) == 1 else RecurrenceType.SEMANAL

            hours_per_class = 0.0
            if start_time and end_time:
                hours_per_class = max(0.0, ((end_time.hour * 60 + end_time.minute) - (start_time.hour * 60 + start_time.minute)) / 60)

            db_config = ScheduleConfig(
                course_id=course.id, module_id=module.id, discipline_id=discipline.id, owner_id=user.id,
                format=DeliveryFormat(group.format), start_date=min(dates), end_date=max(dates),
                recurrence=recurrence, days_of_week=",".join(str(w) for w in weekdays),
                start_time=start_time, end_time=end_time, holiday_policy=HolidayPolicy.RESCHEDULE,
                num_classes=len(group.classes), workload=round(len(group.classes) * hours_per_class),
            )
            db.add(db_config)
            db.flush()

            for order, cls in enumerate(group.classes, start=1):
                db.add(ScheduledClass(config_id=db_config.id, date=cls.date, order=order))

            db.commit()
            imported_configs += 1
            imported_classes += len(group.classes)
        except Exception as e:
            db.rollback()
            skipped_groups += 1
            errors.append({
                "row": group.classes[0].row_number if group.classes else None,
                "field": "grupo",
                "message": f"{group.course_name} / {group.discipline_name}: {e}",
            })

    logger.info(
        f"Importação de cronogramas: arquivo='{file.filename}' cronogramas={imported_configs} "
        f"aulas={imported_classes} grupos_com_erro={skipped_groups}",
        extra={"event": "schedules_imported", "actor_id": user.id},
    )
    return ScheduleImportResult(
        message=(
            f"Importação concluída: {imported_configs} cronograma(s) e {imported_classes} aula(s) criados"
            + (f", {skipped_groups} grupo(s) com erro" if skipped_groups else "") + "."
        ),
        imported_configs=imported_configs,
        imported_classes=imported_classes,
        skipped_groups=skipped_groups,
        total_rows=parsed["total_rows"],
        errors=errors[:25],
    )


@router.get("/schedules/configs/", response_model=List[ScheduleConfigRead])
def list_schedule_configs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # contains_eager reaproveita os joins de filtro para popular course/module/
    # discipline sem consultas extras; owner é populado por joinedload à parte
    # (evita N+1: sem isso, cada config disparava 4 queries extras no loop de
    # _config_to_read).
    query = (
        db.query(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Module, ScheduleConfig.module_id == Module.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .options(
            contains_eager(ScheduleConfig.course),
            contains_eager(ScheduleConfig.module),
            contains_eager(ScheduleConfig.discipline),
            joinedload(ScheduleConfig.owner),
        )
    )
    if user.role != "admin":
        query = query.filter(ScheduleConfig.owner_id == user.id)
    configs = query.order_by(ScheduleConfig.start_date.desc()).all()
    return [_config_to_read(c) for c in configs]


@router.delete("/schedules/all", dependencies=[Depends(require_admin_action)])
def delete_all_schedules(db: Session = Depends(get_db)):
    classes_count = db.query(ScheduledClass).count()
    configs_count = db.query(ScheduleConfig).count()
    db.query(ScheduledClass).delete()
    db.query(ScheduleConfig).delete()
    db.commit()
    logger.warning(
        f"RESET TOTAL: {configs_count} cronogramas e {classes_count} aulas removidos",
        extra={"event": "schedules_deleted_all"},
    )
    return {"message": "Todos os cronogramas foram removidos"}


@router.get("/schedules/{config_id}", response_model=ScheduleConfigRead)
def get_schedule_config(config_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    ensure_owner_or_admin(db_config.owner_id, user)
    return _config_to_read(db_config)


@router.get("/schedules/{config_id}/classes", response_model=List[ScheduledClassRead])
def list_schedule_classes(config_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    ensure_owner_or_admin(db_config.owner_id, user)
    return (
        db.query(ScheduledClass)
        .filter(ScheduledClass.config_id == config_id)
        .order_by(ScheduledClass.order)
        .all()
    )


@router.patch("/schedules/{config_id}/classes/{class_id}", response_model=ScheduledClassRead)
def update_scheduled_class_date(
    config_id: int,
    class_id: int,
    payload: ScheduledClassUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edição pontual: muda a data de UMA aula já gerada ou a cancela, sem
    mexer nas demais aulas do cronograma nem regenerar nada. O motivo é
    obrigatório (payload.reason) e a ação nunca é bloqueada por feriado ou
    recesso — essa validação só se aplica à geração automática do
    cronograma; a alteração manual pontual é sempre uma decisão do professor."""
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    ensure_owner_or_admin(db_config.owner_id, user)

    scheduled_class = (
        db.query(ScheduledClass)
        .filter(ScheduledClass.id == class_id, ScheduledClass.config_id == config_id)
        .first()
    )
    if not scheduled_class:
        raise HTTPException(status_code=404, detail="Aula não encontrada")

    scheduled_class.date = payload.date
    scheduled_class.status = ScheduledClassStatus.CANCELLED if payload.cancelled else ScheduledClassStatus.SCHEDULED
    scheduled_class.change_reason = payload.reason
    db.commit()
    db.refresh(scheduled_class)
    logger.info(
        f"Aula alterada: config_id={config_id} class_id={class_id} nova_data={payload.date} "
        f"cancelada={payload.cancelled} motivo={payload.reason!r}",
        extra={"event": "scheduled_class_date_updated"},
    )
    return scheduled_class


@router.put("/schedules/{config_id}", response_model=FullScheduleRead)
def update_schedule(
    config_id: int,
    schedule_data: FullScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Regenera um cronograma existente: substitui os parâmetros e as aulas
    geradas, preservando o mesmo config_id (não cria um novo cronograma)."""
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    ensure_owner_or_admin(db_config.owner_id, user)
    if db_config.owner_id is None:
        db_config.owner_id = user.id

    validate_schedule_references(db, schedule_data.config, user)
    if not schedule_data.classes:
        raise HTTPException(status_code=422, detail="O cronograma precisa ter pelo menos uma aula.")

    try:
        data = schedule_data.config.model_dump()
        days = data.pop("days_of_week") or []
        data["days_of_week"] = ",".join(str(d) for d in days)
        for key, value in data.items():
            setattr(db_config, key, value)
        db_config.num_classes = len(schedule_data.classes)
        db_config.workload = round(len(schedule_data.classes) * schedule_data.config.class_hours)

        db.query(ScheduledClass).filter(ScheduledClass.config_id == config_id).delete()
        for cls in schedule_data.classes:
            db.add(ScheduledClass(config_id=config_id, date=cls.date, order=cls.order))

        db.commit()
        db.refresh(db_config)
        logger.info(
            f"Cronograma regenerado: config_id={config_id} curso={db_config.course_id} "
            f"disciplina={db_config.discipline_id} aulas={db_config.num_classes}",
            extra={"event": "schedule_updated"},
        )
        return db_config
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao regenerar cronograma: {e}", extra={"event": "schedule_update_failed"}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao regenerar cronograma: {str(e)}")


@router.delete("/schedules/{config_id}")
def delete_specific_schedule(config_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    ensure_owner_or_admin(db_config.owner_id, user)

    db.query(ScheduledClass).filter(ScheduledClass.config_id == config_id).delete()
    db.delete(db_config)
    db.commit()
    logger.info(f"Cronograma removido: config_id={config_id}", extra={"event": "schedule_deleted"})
    return {"message": "Cronograma removido com sucesso"}


@router.get("/schedules/export/xlsx")
def export_schedules_xlsx(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Module, ScheduleConfig.module_id == Module.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .options(
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.course),
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.module),
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.discipline),
        )
    )
    if user.role != "admin":
        query = query.filter(ScheduleConfig.owner_id == user.id)
    results = query.order_by(ScheduledClass.date).all()
    rows = [
        {
            "Instituição": sc.config.course.institution or "",
            "Nível": _level_label(sc.config.course),
            "Curso": sc.config.course.name,
            "Semestre": sc.config.course.semester or "",
            "Módulo": sc.config.module.name,
            "Disciplina": sc.config.discipline.name,
            "Formato": sc.config.format.value.capitalize(),
            "Data": sc.date.strftime('%d/%m/%Y'),
            "Dia da Semana": DAYS_PT[sc.date.weekday()],
            "Início": _fmt_time(sc.config.start_time),
            "Término": _fmt_time(sc.config.end_time),
            "Nº da Aula": sc.order,
            "Carga Horária Total (h)": sc.config.workload or "",
        }
        for sc in results
    ]
    empty = {k: "" for k in [
        "Instituição", "Nível", "Curso", "Semestre", "Módulo", "Disciplina", "Formato",
        "Data", "Dia da Semana", "Início", "Término", "Nº da Aula", "Carga Horária Total (h)",
    ]}
    df = pd.DataFrame(rows if rows else [empty])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Cronograma')
        ws = writer.sheets['Cronograma']
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(max(len(str(c.value or '')) for c in col) + 4, 40)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename="cronograma.xlsx"'},
    )


@router.post("/schedules/export-preview/xlsx")
def export_preview_xlsx(data: PreviewExportRequest):
    rows = [
        {
            "Instituição": data.institution or "",
            "Nível": (data.academic_level or "").replace("_", " ").title(),
            "Curso": data.course_name,
            "Semestre": data.semester or "",
            "Módulo": data.module_name,
            "Disciplina": data.discipline_name,
            "Formato": data.format.capitalize(),
            "Data": d.strftime('%d/%m/%Y'),
            "Dia da Semana": DAYS_PT[d.weekday()],
            "Início": _fmt_time(data.start_time),
            "Término": _fmt_time(data.end_time),
            "Nº da Aula": i + 1,
            "Carga Horária Total (h)": data.workload or "",
        }
        for i, d in enumerate(data.dates)
    ]
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Preview')
        ws = writer.sheets['Preview']
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(max(len(str(c.value or '')) for c in col) + 4, 40)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename="cronograma_preview.xlsx"'},
    )


@router.get("/schedules/", response_model=List[CalendarEventRead])
def list_all_scheduled_classes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .options(
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.course),
            contains_eager(ScheduledClass.config).contains_eager(ScheduleConfig.discipline),
        )
    )
    if user.role != "admin":
        query = query.filter(ScheduleConfig.owner_id == user.id)
    results = query.all()

    return [
        {
            "id": sc.id,
            "date": sc.date,
            "order": sc.order,
            "discipline_id": sc.config.discipline_id,
            "format": sc.config.format.value,
            "course_name": sc.config.course.name,
            "academic_level": sc.config.course.academic_level.value,
            "academic_level_label": _level_label(sc.config.course),
            "discipline_name": sc.config.discipline.name,
            "event_title": sc.config.event_title,
            "start_time": sc.config.start_time,
            "end_time": sc.config.end_time,
            "color": _discipline_color(sc.config.discipline_id),
        }
        for sc in results
    ]
