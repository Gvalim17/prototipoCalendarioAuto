from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import ensure_owner_or_admin, get_course_or_404, get_current_user, get_discipline_or_404, get_module_or_404
from ..logging_config import get_logger
from ..models.base import AcademicLevel, Course, Discipline, Module, User
from ..schemas.base_schemas import (
    CourseCreate,
    CourseRead,
    CourseUpdate,
    DisciplineCreate,
    DisciplineRead,
    DisciplineUpdate,
    ModuleCreate,
    ModuleRead,
    ModuleUpdate,
)


router = APIRouter()
logger = get_logger()


# --- Courses ---
# Cursos, módulos e disciplinas são isolados por professor: cada um só vê,
# edita e exclui o próprio catálogo (admin vê e gerencia tudo). Registros
# criados antes desse isolamento existir ficam com owner_id nulo — somem da
# listagem de professores comuns até serem reivindicados via edição, mesmo
# padrão já usado em ScheduleConfig.
@router.post("/courses/", response_model=CourseRead)
@router.post("/mbas/", response_model=CourseRead, include_in_schema=False)
def create_course(course: CourseCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_course = Course(**course.model_dump(), owner_id=user.id)
    db.add(db_course)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um curso com este nome no seu catálogo.")
    db.refresh(db_course)
    return db_course


@router.get("/courses/", response_model=List[CourseRead])
@router.get("/mbas/", response_model=List[CourseRead], include_in_schema=False)
def list_courses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    institution: Optional[str] = Query(None),
    academic_level: Optional[AcademicLevel] = Query(None),
    year: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
):
    query = db.query(Course).options(
        joinedload(Course.modules).joinedload(Module.disciplines)
    )
    if user.role != "admin":
        query = query.filter(Course.owner_id == user.id)
    if institution:
        query = query.filter(Course.institution.ilike(f"%{institution}%"))
    if academic_level:
        query = query.filter(Course.academic_level == academic_level)
    if year:
        query = query.filter(Course.year == year)
    if semester:
        query = query.filter(Course.semester == semester)
    return query.all()


@router.get("/courses/{course_id}", response_model=CourseRead)
@router.get("/mbas/{course_id}", response_model=CourseRead, include_in_schema=False)
def get_course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_course = (
        db.query(Course)
        .options(joinedload(Course.modules).joinedload(Module.disciplines))
        .filter(Course.id == course_id)
        .first()
    )
    if not db_course:
        raise HTTPException(status_code=404, detail="Curso não encontrado")
    ensure_owner_or_admin(db_course.owner_id, user, resource="Este curso")
    return db_course


@router.put("/courses/{course_id}", response_model=CourseRead)
@router.put("/mbas/{course_id}", response_model=CourseRead, include_in_schema=False)
def update_course(course_id: int, course_update: CourseUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_course = get_course_or_404(db, course_id)
    ensure_owner_or_admin(db_course.owner_id, user, resource="Este curso")
    if db_course.owner_id is None:
        db_course.owner_id = user.id
    for key, value in course_update.model_dump(exclude_unset=True).items():
        setattr(db_course, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um curso com este nome no seu catálogo.")
    db.refresh(db_course)
    return db_course


@router.delete("/courses/{course_id}")
@router.delete("/mbas/{course_id}", include_in_schema=False)
def delete_course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_course = get_course_or_404(db, course_id)
    ensure_owner_or_admin(db_course.owner_id, user, resource="Este curso")
    course_name = db_course.name
    db.delete(db_course)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir este curso porque há cronogramas cadastrados para ele. Exclua os cronogramas associados primeiro.",
        )
    logger.warning(f"Curso excluído: id={course_id} nome='{course_name}'", extra={"event": "course_deleted"})
    return {"message": "Curso excluído com sucesso"}


# --- Modules ---
@router.post("/modules/", response_model=ModuleRead)
def create_module(module: ModuleCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = get_course_or_404(db, module.course_id)
    ensure_owner_or_admin(course.owner_id, user, resource="Este curso")
    db_mod = Module(**module.model_dump(), owner_id=course.owner_id)
    db.add(db_mod)
    db.commit()
    db.refresh(db_mod)
    return db_mod


@router.get("/courses/{course_id}/modules", response_model=List[ModuleRead])
@router.get("/mbas/{course_id}/modules", response_model=List[ModuleRead], include_in_schema=False)
def list_course_modules(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = get_course_or_404(db, course_id)
    ensure_owner_or_admin(course.owner_id, user, resource="Este curso")
    return db.query(Module).filter(Module.course_id == course_id).all()


@router.put("/modules/{module_id}", response_model=ModuleRead)
def update_module(module_id: int, module_update: ModuleUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_mod = get_module_or_404(db, module_id)
    ensure_owner_or_admin(db_mod.owner_id, user, resource="Este módulo")
    update_data = module_update.model_dump(exclude_unset=True)
    if "course_id" in update_data:
        new_course = get_course_or_404(db, update_data["course_id"])
        ensure_owner_or_admin(new_course.owner_id, user, resource="Este curso")
    for key, value in update_data.items():
        setattr(db_mod, key, value)
    db.commit()
    db.refresh(db_mod)
    return db_mod


@router.delete("/modules/{module_id}")
def delete_module(module_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_mod = get_module_or_404(db, module_id)
    ensure_owner_or_admin(db_mod.owner_id, user, resource="Este módulo")
    db.delete(db_mod)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir este módulo porque há cronogramas cadastrados para ele ou suas disciplinas. Exclua os cronogramas associados primeiro.",
        )
    return {"message": "Módulo excluído com sucesso"}


# --- Disciplines ---
@router.post("/disciplines/", response_model=DisciplineRead)
def create_discipline(discipline: DisciplineCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    module = get_module_or_404(db, discipline.module_id)
    ensure_owner_or_admin(module.owner_id, user, resource="Este módulo")
    db_disc = Discipline(**discipline.model_dump(), owner_id=module.owner_id)
    db.add(db_disc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe uma disciplina com este código no seu catálogo.")
    db.refresh(db_disc)
    return db_disc


@router.get("/modules/{module_id}/disciplines", response_model=List[DisciplineRead])
def list_module_disciplines(module_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    module = get_module_or_404(db, module_id)
    ensure_owner_or_admin(module.owner_id, user, resource="Este módulo")
    return db.query(Discipline).filter(Discipline.module_id == module_id).all()


@router.put("/disciplines/{discipline_id}", response_model=DisciplineRead)
def update_discipline(discipline_id: int, disc_update: DisciplineUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_disc = get_discipline_or_404(db, discipline_id)
    ensure_owner_or_admin(db_disc.owner_id, user, resource="Esta disciplina")
    update_data = disc_update.model_dump(exclude_unset=True)
    if "module_id" in update_data:
        new_module = get_module_or_404(db, update_data["module_id"])
        ensure_owner_or_admin(new_module.owner_id, user, resource="Este módulo")
    for key, value in update_data.items():
        setattr(db_disc, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe uma disciplina com este código no seu catálogo.")
    db.refresh(db_disc)
    return db_disc


@router.delete("/disciplines/{discipline_id}")
def delete_discipline(discipline_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_disc = get_discipline_or_404(db, discipline_id)
    ensure_owner_or_admin(db_disc.owner_id, user, resource="Esta disciplina")
    db.delete(db_disc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir esta disciplina porque há cronogramas cadastrados para ela. Exclua os cronogramas associados primeiro.",
        )
    return {"message": "Disciplina excluída com sucesso"}


@router.get("/disciplines/search")
def search_disciplines(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(q) < 2:
        return []
    query = (
        db.query(Discipline, Module, Course)
        .join(Module, Discipline.module_id == Module.id)
        .join(Course, Module.course_id == Course.id)
        .filter(Discipline.name.ilike(f"%{q}%"))
    )
    if user.role != "admin":
        query = query.filter(Discipline.owner_id == user.id)
    results = query.limit(10).all()
    return [
        {
            "id": disc.id,
            "name": disc.name,
            "code": disc.code,
            "module_name": mod.name,
            "course_name": course.name,
        }
        for disc, mod, course in results
    ]
