from typing import List
import io

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin_action, validate_schedule_references
from ..logging_config import get_logger
from ..models.base import Course, Discipline, Module, ScheduleConfig, ScheduledClass, User
from ..schemas.base_schemas import (
    CalendarEventRead,
    FullScheduleCreate,
    FullScheduleRead,
    PreviewExportRequest,
    ResolveConflictsRequest,
    ResolvedScheduleResponse,
    ScheduleConfigBase,
    ScheduleConfigRead,
    ScheduledClassRead,
    ScheduleResponse,
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
        "num_classes": db_config.num_classes,
        "workload": db_config.workload,
        "course_name": db_config.course.name,
        "module_name": db_config.module.name,
        "discipline_name": db_config.discipline.name,
    }


@router.get("/stats/", response_model=StatsRead)
def get_stats(db: Session = Depends(get_db)):
    return StatsRead(
        courses=db.query(Course).count(),
        modules=db.query(Module).count(),
        disciplines=db.query(Discipline).count(),
        scheduled_classes=db.query(ScheduledClass).count(),
    )


@router.post("/generate-schedule/", response_model=ScheduleResponse)
def generate_schedule(config: ScheduleConfigBase, db: Session = Depends(get_db)):
    try:
        validate_schedule_references(db, config)
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
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve-conflicts/", response_model=ResolvedScheduleResponse, include_in_schema=False)
@router.post("/schedules/resolve-conflicts/", response_model=ResolvedScheduleResponse)
def resolve_schedule_conflicts(request: ResolveConflictsRequest, db: Session = Depends(get_db)):
    try:
        validate_schedule_references(db, request.config)
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
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedules/", response_model=FullScheduleRead)
def save_schedule(
    schedule_data: FullScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_schedule_references(db, schedule_data.config)
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


@router.get("/schedules/configs/", response_model=List[ScheduleConfigRead])
def list_schedule_configs(db: Session = Depends(get_db)):
    configs = (
        db.query(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Module, ScheduleConfig.module_id == Module.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .order_by(ScheduleConfig.start_date.desc())
        .all()
    )
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
def get_schedule_config(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    return _config_to_read(db_config)


@router.get("/schedules/{config_id}/classes", response_model=List[ScheduledClassRead])
def list_schedule_classes(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    return (
        db.query(ScheduledClass)
        .filter(ScheduledClass.config_id == config_id)
        .order_by(ScheduledClass.order)
        .all()
    )


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
    if db_config.owner_id is not None and db_config.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Este cronograma pertence a outro professor.")
    if db_config.owner_id is None:
        db_config.owner_id = user.id

    validate_schedule_references(db, schedule_data.config)
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
def delete_specific_schedule(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")

    db.query(ScheduledClass).filter(ScheduledClass.config_id == config_id).delete()
    db.delete(db_config)
    db.commit()
    logger.info(f"Cronograma removido: config_id={config_id}", extra={"event": "schedule_deleted"})
    return {"message": "Cronograma removido com sucesso"}


@router.get("/schedules/export/xlsx")
def export_schedules_xlsx(db: Session = Depends(get_db)):
    results = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Module, ScheduleConfig.module_id == Module.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .order_by(ScheduledClass.date)
        .all()
    )
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
def list_all_scheduled_classes(db: Session = Depends(get_db)):
    results = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(Course, ScheduleConfig.course_id == Course.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .all()
    )

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
            "start_time": sc.config.start_time,
            "end_time": sc.config.end_time,
            "color": _discipline_color(sc.config.discipline_id),
        }
        for sc in results
    ]
