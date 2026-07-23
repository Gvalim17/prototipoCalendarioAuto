import json
import os
from datetime import datetime, date
from ..models.base import Holiday, Recess, Course, Module, Discipline, AcademicLevel, Base
from ..database import SessionLocal, engine

def seed_data():
    db = SessionLocal()
    try:
        # Garante que as tabelas existam
        Base.metadata.create_all(bind=engine)

        # 1. Seed Cursos
        if not db.query(Course).first():
            courses = [
                Course(
                    name="MBA em Engenharia de Dados",
                    institution="Instituto Exemplo",
                    academic_level=AcademicLevel.MBA,
                    description="Foco em Big Data e Analytics",
                    year=2026,
                ),
                Course(
                    name="MBA em Gestão Estratégica",
                    institution="Instituto Exemplo",
                    academic_level=AcademicLevel.MBA,
                    description="Liderança e Processos",
                    year=2026,
                ),
            ]
            db.add_all(courses)
            db.commit()
            print("Cursos semeados.")

            # 2. Seed Módulos e Disciplinas (para o primeiro Curso)
            course1 = db.query(Course).first()
            mod1 = Module(name="Módulo Técnico I", course_id=course1.id)
            db.add(mod1)
            db.commit()

            discs = [
                Discipline(name="Arquitetura de Big Data", code="ABD01", module_id=mod1.id),
                Discipline(name="Processamento em Stream", code="PES02", module_id=mod1.id)
            ]
            db.add_all(discs)
            db.commit()
            print("Estrutura acadêmica inicial semeada.")

        # 3. Seed Holidays
        json_path = os.path.join(os.path.dirname(__file__), "holidays_2026.json")
        with open(json_path, "r", encoding="utf-8") as f:
            holidays_data = json.load(f)

        # Limpa feriados existentes para garantir a lista nova
        db.query(Holiday).delete()

        for h in holidays_data:
            h_date = datetime.strptime(h["date"], "%Y-%m-%d").date()
            new_holiday = Holiday(
                date=h_date,
                description=h["description"],
                type=h.get("type", "nacional"),
                source=h.get("source", "Institucional")
            )
            db.add(new_holiday)

        # 4. Seed Recesso
        if not db.query(Recess).first():
            recess = Recess(
                start_date=date(2026, 12, 21),
                end_date=date(2027, 1, 3),
                description="Recesso de Final de Ano 2026/2027",
                source="Planejamento Acadêmico"
            )
            db.add(recess)

        db.commit()
        print("Feriados e Recessos semeados com sucesso.")
    except Exception as e:
        print(f"Erro ao semear dados: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
