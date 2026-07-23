from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin_action
from ..models.base import Recess
from ..schemas.base_schemas import RecessCreate, RecessRead


router = APIRouter()


@router.post("/recesses/", response_model=RecessRead)
def create_recess(recess: RecessCreate, db: Session = Depends(get_db)):
    if recess.start_date >= recess.end_date:
        raise HTTPException(status_code=422, detail="A data de início deve ser anterior à data de fim.")
    overlapping = db.query(Recess).filter(
        Recess.start_date <= recess.end_date,
        Recess.end_date >= recess.start_date,
    ).first()
    if overlapping:
        raise HTTPException(
            status_code=409,
            detail=f"O período informado se sobrepõe com o recesso '{overlapping.description}' ({overlapping.start_date} – {overlapping.end_date})."
        )
    db_recess = Recess(**recess.model_dump())
    db.add(db_recess)
    db.commit()
    db.refresh(db_recess)
    return db_recess


@router.get("/recesses/", response_model=List[RecessRead])
def list_recesses(db: Session = Depends(get_db)):
    return db.query(Recess).all()


@router.delete("/recesses/all", dependencies=[Depends(require_admin_action)])
def delete_all_recesses(db: Session = Depends(get_db)):
    db.query(Recess).delete()
    db.commit()
    return {"message": "Todos os recessos foram removidos"}


@router.delete("/recesses/{recess_id}")
def delete_recess(recess_id: int, db: Session = Depends(get_db)):
    db_recess = db.query(Recess).filter(Recess.id == recess_id).first()
    if not db_recess:
        raise HTTPException(status_code=404, detail="Recesso não encontrado")
    db.delete(db_recess)
    db.commit()
    return {"message": "Recesso removido com sucesso"}
