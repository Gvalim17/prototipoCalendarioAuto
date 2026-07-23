from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin_action
from ..logging_config import get_logger
from ..models.base import Holiday
from ..schemas.base_schemas import HolidayCreate, HolidayRead
from ..services.holiday_importer import import_holidays, parse_holiday_file


router = APIRouter()
logger = get_logger()


@router.post("/holidays/", response_model=HolidayRead)
def create_holiday(holiday: HolidayCreate, db: Session = Depends(get_db)):
    db_holiday = Holiday(**holiday.model_dump())
    db.add(db_holiday)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Já existe um feriado cadastrado na data {holiday.date}.")
    db.refresh(db_holiday)
    return db_holiday


@router.get("/holidays/", response_model=List[HolidayRead])
def list_holidays(db: Session = Depends(get_db)):
    return db.query(Holiday).order_by(Holiday.date).all()


@router.delete("/holidays/all", dependencies=[Depends(require_admin_action)])
def delete_all_holidays(db: Session = Depends(get_db)):
    count = db.query(Holiday).count()
    db.query(Holiday).delete()
    db.commit()
    logger.warning(f"RESET TOTAL: {count} feriados removidos", extra={"event": "holidays_deleted_all"})
    return {"message": "Todos os feriados foram removidos"}


@router.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    db_holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(status_code=404, detail="Feriado não encontrado")
    db.delete(db_holiday)
    db.commit()
    return {"message": "Feriado removido com sucesso"}


@router.post("/holidays/upload/")
async def upload_holidays(
    file: UploadFile = File(...),
    year: int = Form(2026),
    db: Session = Depends(get_db),
):
    try:
        content = await file.read()
        parsed = parse_holiday_file(file.filename or "", content, default_year=year)
        result = import_holidays(db, parsed["rows"], parsed["errors"])
        result["columns"] = parsed["columns"]
        logger.info(
            f"Importação de feriados: arquivo='{file.filename}' criados={result.get('created')} "
            f"atualizados={result.get('updated')} falhas={result.get('failed')}",
            extra={"event": "holidays_imported"},
        )
        return result
    except ValueError as e:
        db.rollback()
        logger.warning(f"Falha na validação da importação de feriados: {e}", extra={"event": "holidays_import_invalid"})
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao importar feriados: {e}", extra={"event": "holidays_import_failed"}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao importar feriados: {str(e)}")
