import json
import os
from datetime import datetime, date
from sqlalchemy.orm import Session
from ..models.base import Holiday, Recess, MBA, Module, Discipline, SessionLocal, engine, Base

def seed_data():
    db = SessionLocal()
    try:
        # Garante que as tabelas existam
        Base.metadata.create_all(bind=engine)
        
        # 1. Seed MBAs
        if not db.query(MBA).first():
            mbas = [
                MBA(name="MBA em Engenharia de Dados", description="Foco em Big Data e Analytics", year=2026),
                MBA(name="MBA em Gestão Estratégica", description="Liderança e Processos", year=2026)
            ]
            db.add_all(mbas)
            db.commit()
            print("MBAs semeados.")

            # 2. Seed Módulos e Disciplinas (para o primeiro MBA)
            mba1 = db.query(MBA).first()
            mod1 = Module(name="Módulo Técnico I", mba_id=mba1.id)
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
