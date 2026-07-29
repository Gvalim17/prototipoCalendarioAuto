"""Semeia dados de exemplo para quem acabou de clonar o projeto.

- Feriados nacionais de 2026 + um recesso de fim de ano: sempre seguro rodar,
  são dados globais (não pertencem a nenhum professor).
- Um curso/módulo/disciplinas de demonstração: opcional, vinculado a uma conta
  já cadastrada (o sistema isola dados por professor — sem dono, o curso não
  apareceria para ninguém além de um admin).

Uso (com o venv do backend ativado, a partir da pasta backend/):
    python -m app.utils.seed_data
    python -m app.utils.seed_data --email=voce@example.com
"""

import argparse
import json
import os
from datetime import datetime, date

from ..database import SessionLocal, engine
from ..models.base import AcademicLevel, Base, Course, Discipline, Holiday, Module, Recess, User


def seed_holidays(db) -> None:
    json_path = os.path.join(os.path.dirname(__file__), "holidays_2026.json")
    with open(json_path, "r", encoding="utf-8") as f:
        holidays_data = json.load(f)

    existing_dates = {h.date for h in db.query(Holiday).all()}
    created = 0
    for h in holidays_data:
        h_date = datetime.strptime(h["date"], "%Y-%m-%d").date()
        if h_date in existing_dates:
            continue
        db.add(Holiday(
            date=h_date,
            description=h["description"],
            type=h.get("type", "nacional"),
            source=h.get("source", "Institucional"),
        ))
        created += 1

    if not db.query(Recess).first():
        db.add(Recess(
            start_date=date(2026, 12, 21),
            end_date=date(2027, 1, 3),
            description="Recesso de Final de Ano 2026/2027",
            source="Planejamento Acadêmico",
        ))

    db.commit()
    print(f"Feriados: {created} novo(s) criado(s) (recesso de fim de ano garantido).")


def seed_demo_course(db, owner_email: str) -> None:
    owner = db.query(User).filter(User.email == owner_email).first()
    if not owner:
        print(f"Nenhuma conta encontrada com o e-mail '{owner_email}'. Cadastre-se no sistema primeiro e rode de novo.")
        return
    if db.query(Course).filter(Course.owner_id == owner.id).first():
        print(f"'{owner_email}' já tem cursos cadastrados — nada foi criado, para não duplicar.")
        return

    course = Course(
        name="MBA em Engenharia de Dados",
        institution="Instituto Exemplo",
        academic_level=AcademicLevel.MBA,
        description="Foco em Big Data e Analytics",
        year=2026,
        owner_id=owner.id,
    )
    db.add(course)
    db.flush()

    module = Module(name="Módulo Técnico I", course_id=course.id, owner_id=owner.id)
    db.add(module)
    db.flush()

    db.add_all([
        Discipline(name="Arquitetura de Big Data", code="ABD01", module_id=module.id, owner_id=owner.id),
        Discipline(name="Processamento em Stream", code="PES02", module_id=module.id, owner_id=owner.id),
    ])
    db.commit()
    print(f"Curso de demonstração criado para '{owner_email}'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Semeia dados de exemplo no CronEdu.")
    parser.add_argument("--email", help="E-mail de uma conta já cadastrada para receber um curso de demonstração.")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_holidays(db)
        if args.email:
            seed_demo_course(db, args.email)
        else:
            print(
                "Nenhum --email informado — só os feriados foram semeados. "
                "Cadastre-se no sistema e rode de novo com --email=seu@email.com para ganhar um curso de exemplo."
            )
    except Exception as e:
        db.rollback()
        print(f"Erro ao semear dados: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
