from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
import io
from .models.base import Base, MBA, Module, Discipline, Holiday, Recess, ScheduleConfig
from .schemas.base_schemas import (
    MBACreate, MBARead,
    ModuleCreate, ModuleRead,
    DisciplineCreate, DisciplineRead,
    HolidayCreate, HolidayRead,
    RecessCreate, RecessRead,
    ScheduleConfigBase, ScheduleResponse,
    MBAUpdate, ModuleUpdate, DisciplineUpdate,
    FullScheduleCreate, FullScheduleRead, ScheduledClassCreate,
    CalendarEventRead, PreviewExportRequest,
    ResolveConflictsRequest, ResolvedScheduleResponse
)
from .models.base import ScheduledClass
from .services.schedule_generator import ScheduleGeneratorService
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from fastapi.middleware.cors import CORSMiddleware

# Configuração Database
SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Cria as tabelas
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MBA 2026 · Sistema de Calendário Inteligente")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"status": "online", "message": "API de Calendário MBA 2026"}

# --- MBA ---
@app.post("/mbas/", response_model=MBARead)
def create_mba(mba: MBACreate, db: Session = Depends(get_db)):
    db_mba = MBA(**mba.model_dump())
    db.add(db_mba)
    db.commit()
    db.refresh(db_mba)
    return db_mba

@app.get("/mbas/", response_model=List[MBARead])
def list_mbas(db: Session = Depends(get_db)):
    return (
        db.query(MBA)
        .options(joinedload(MBA.modules).joinedload(Module.disciplines))
        .all()
    )

@app.put("/mbas/{mba_id}", response_model=MBARead)
def update_mba(mba_id: int, mba_update: MBAUpdate, db: Session = Depends(get_db)):
    db_mba = db.query(MBA).filter(MBA.id == mba_id).first()
    if not db_mba:
        raise HTTPException(status_code=404, detail="MBA não encontrado")
    for key, value in mba_update.model_dump(exclude_unset=True).items():
        setattr(db_mba, key, value)
    db.commit()
    db.refresh(db_mba)
    return db_mba

@app.delete("/mbas/{mba_id}")
def delete_mba(mba_id: int, db: Session = Depends(get_db)):
    db_mba = db.query(MBA).filter(MBA.id == mba_id).first()
    if not db_mba:
        raise HTTPException(status_code=404, detail="MBA não encontrado")
    db.delete(db_mba)
    db.commit()
    return {"message": "MBA excluído com sucesso"}

# --- Modules ---
@app.post("/modules/", response_model=ModuleRead)
def create_module(module: ModuleCreate, db: Session = Depends(get_db)):
    db_mod = Module(**module.model_dump())
    db.add(db_mod)
    db.commit()
    db.refresh(db_mod)
    return db_mod

@app.get("/mbas/{mba_id}/modules", response_model=List[ModuleRead])
def list_mba_modules(mba_id: int, db: Session = Depends(get_db)):
    return db.query(Module).filter(Module.mba_id == mba_id).all()

# --- Disciplines ---
@app.post("/disciplines/", response_model=DisciplineRead)
def create_discipline(discipline: DisciplineCreate, db: Session = Depends(get_db)):
    db_disc = Discipline(**discipline.model_dump())
    db.add(db_disc)
    db.commit()
    db.refresh(db_disc)
    return db_disc

@app.get("/modules/{module_id}/disciplines", response_model=List[DisciplineRead])
def list_module_disciplines(module_id: int, db: Session = Depends(get_db)):
    return db.query(Discipline).filter(Discipline.module_id == module_id).all()

@app.put("/modules/{module_id}", response_model=ModuleRead)
def update_module(module_id: int, module_update: ModuleUpdate, db: Session = Depends(get_db)):
    db_mod = db.query(Module).filter(Module.id == module_id).first()
    if not db_mod:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    for key, value in module_update.model_dump(exclude_unset=True).items():
        setattr(db_mod, key, value)
    db.commit()
    db.refresh(db_mod)
    return db_mod

@app.delete("/modules/{module_id}")
def delete_module(module_id: int, db: Session = Depends(get_db)):
    db_mod = db.query(Module).filter(Module.id == module_id).first()
    if not db_mod:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    db.delete(db_mod)
    db.commit()
    return {"message": "Módulo excluído com sucesso"}

@app.put("/disciplines/{discipline_id}", response_model=DisciplineRead)
def update_discipline(discipline_id: int, disc_update: DisciplineUpdate, db: Session = Depends(get_db)):
    db_disc = db.query(Discipline).filter(Discipline.id == discipline_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada")
    for key, value in disc_update.model_dump(exclude_unset=True).items():
        setattr(db_disc, key, value)
    db.commit()
    db.refresh(db_disc)
    return db_disc

@app.delete("/disciplines/{discipline_id}")
def delete_discipline(discipline_id: int, db: Session = Depends(get_db)):
    db_disc = db.query(Discipline).filter(Discipline.id == discipline_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada")
    db.delete(db_disc)
    db.commit()
    return {"message": "Disciplina excluída com sucesso"}

# --- Holiday ---
@app.post("/holidays/", response_model=HolidayRead)
def create_holiday(holiday: HolidayCreate, db: Session = Depends(get_db)):
    db_holiday = Holiday(**holiday.model_dump())
    db.add(db_holiday)
    db.commit()
    db.refresh(db_holiday)
    return db_holiday

@app.get("/holidays/", response_model=List[HolidayRead])
def list_holidays(db: Session = Depends(get_db)):
    return db.query(Holiday).order_by(Holiday.date).all()

@app.delete("/holidays/all")
def delete_all_holidays(db: Session = Depends(get_db)):
    db.query(Holiday).delete()
    db.commit()
    return {"message": "Todos os feriados foram removidos"}

@app.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    db_holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(status_code=404, detail="Feriado não encontrado")
    db.delete(db_holiday)
    db.commit()
    return {"message": "Feriado removido com sucesso"}

@app.post("/holidays/upload/")
async def upload_holidays(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read()
        
        # Detectar formato baseado na extensão ou conteúdo
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Formato de arquivo não suportado. Use CSV ou Excel.")

        # Normalização de colunas (caso o usuário use nomes diferentes)
        # Esperado: Data, Descrição, Tipo
        df.columns = [c.lower().strip() for c in df.columns]
        
        column_map = {
            'data': 'date',
            'date': 'date',
            'descrição': 'description',
            'descricao': 'description',
            'description': 'description',
            'tipo': 'type',
            'type': 'type'
        }
        
        df = df.rename(columns=column_map)
        
        # Validar colunas obrigatórias
        required = ['date', 'description']
        if not all(col in df.columns for col in required):
            raise HTTPException(status_code=400, detail=f"O arquivo deve conter colunas de Data e Descrição. Colunas encontradas: {list(df.columns)}")

        count = 0
        for _, row in df.iterrows():
            try:
                # Converter data
                raw_date = row['date']
                if isinstance(raw_date, str):
                    h_date = pd.to_datetime(raw_date, dayfirst=True).date()
                else:
                    h_date = raw_date.date() if hasattr(raw_date, 'date') else pd.to_datetime(raw_date, dayfirst=True).date()
                
                # Verificar se já existe
                exists = db.query(Holiday).filter(Holiday.date == h_date).first()
                if exists:
                    # Atualizar se já existir
                    exists.description = str(row['description'])
                    exists.type = str(row.get('type', 'nacional'))
                else:
                    new_h = Holiday(
                        date=h_date,
                        description=str(row['description']),
                        type=str(row.get('type', 'nacional'))
                    )
                    db.add(new_h)
                count += 1
            except Exception as e:
                print(f"Erro ao processar linha: {row}. Erro: {e}")
                continue
        
        db.commit()
        return {"message": f"Sucesso! {count} feriados processados.", "total": count}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")

# --- Recess ---
@app.post("/recesses/", response_model=RecessRead)
def create_recess(recess: RecessCreate, db: Session = Depends(get_db)):
    db_recess = Recess(**recess.model_dump())
    db.add(db_recess)
    db.commit()
    db.refresh(db_recess)
    return db_recess

@app.get("/recesses/", response_model=List[RecessRead])
def list_recesses(db: Session = Depends(get_db)):
    return db.query(Recess).all()

@app.delete("/recesses/all")
def delete_all_recesses(db: Session = Depends(get_db)):
    db.query(Recess).delete()
    db.commit()
    return {"message": "Todos os recessos foram removidos"}

@app.delete("/recesses/{recess_id}")
def delete_recess(recess_id: int, db: Session = Depends(get_db)):
    db_recess = db.query(Recess).filter(Recess.id == recess_id).first()
    if not db_recess:
        raise HTTPException(status_code=404, detail="Recesso não encontrado")
    db.delete(db_recess)
    db.commit()
    return {"message": "Recesso removido com sucesso"}

# --- Schedule Generator ---
@app.post("/generate-schedule/", response_model=ScheduleResponse)
def generate_schedule(config: ScheduleConfigBase, db: Session = Depends(get_db)):
    try:
        # Convert schema to temporary model object (not saved yet)
        cfg_model = ScheduleConfig(**config.model_dump())
        result = ScheduleGeneratorService.generate_schedule(db, cfg_model)
        
        return ScheduleResponse(
            dates=result["dates"],
            skipped=result["skipped"],
            config=config
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/schedules/", response_model=FullScheduleRead)
def save_schedule(schedule_data: FullScheduleCreate, db: Session = Depends(get_db)):
    # 1. Save Config
    db_config = ScheduleConfig(**schedule_data.config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    
    # 2. Save Classes
    for cls in schedule_data.classes:
        db_class = ScheduledClass(
            config_id=db_config.id,
            date=cls.date,
            order=cls.order
        )
        db.add(db_class)
    
    db.commit()
    db.refresh(db_config)
    return db_config

@app.delete("/schedules/all")
def delete_all_schedules(db: Session = Depends(get_db)):
    db.query(ScheduledClass).delete()
    db.query(ScheduleConfig).delete()
    db.commit()
    return {"message": "Todos os cronogramas foram removidos"}

@app.delete("/schedules/{config_id}")
def delete_specific_schedule(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Cronograma não encontrado")
    
    # Cascade delete is handled by database normally, but manual here for safety
    db.query(ScheduledClass).filter(ScheduledClass.config_id == config_id).delete()
    db.delete(db_config)
    db.commit()
    return {"message": "Cronograma removido com sucesso"}

@app.get("/schedules/export/xlsx")
def export_schedules_xlsx(db: Session = Depends(get_db)):
    DAYS_PT = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
    results = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(MBA, ScheduleConfig.mba_id == MBA.id)
        .join(Module, ScheduleConfig.module_id == Module.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .order_by(ScheduledClass.date)
        .all()
    )
    rows = [
        {
            "MBA": sc.config.mba.name,
            "Módulo": sc.config.module.name,
            "Disciplina": sc.config.discipline.name,
            "Formato": sc.config.format.value.capitalize(),
            "Data": sc.date.strftime('%d/%m/%Y'),
            "Dia da Semana": DAYS_PT[sc.date.weekday()],
            "Nº da Aula": sc.order,
            "Carga Horária (h)": sc.config.workload,
        }
        for sc in results
    ]
    df = pd.DataFrame(rows if rows else [{"MBA": "", "Módulo": "", "Disciplina": "", "Formato": "", "Data": "", "Dia da Semana": "", "Nº da Aula": "", "Carga Horária (h)": ""}])
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
        headers={'Content-Disposition': 'attachment; filename="cronograma_MBA_2026.xlsx"'}
    )

@app.post("/schedules/export-preview/xlsx")
def export_preview_xlsx(data: PreviewExportRequest):
    DAYS_PT = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
    rows = [
        {
            "MBA": data.mba_name,
            "Módulo": data.module_name,
            "Disciplina": data.discipline_name,
            "Formato": data.format.capitalize(),
            "Data": d.strftime('%d/%m/%Y'),
            "Dia da Semana": DAYS_PT[d.weekday()],
            "Nº da Aula": i + 1,
            "Carga Horária (h)": data.workload,
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
        headers={'Content-Disposition': 'attachment; filename="cronograma_preview.xlsx"'}
    )

@app.get("/schedules/", response_model=List[CalendarEventRead])
def list_all_scheduled_classes(db: Session = Depends(get_db)):
    # Realiza join para obter nomes do MBA e Disciplina
    results = (
        db.query(ScheduledClass)
        .join(ScheduleConfig)
        .join(MBA, ScheduleConfig.mba_id == MBA.id)
        .join(Discipline, ScheduleConfig.discipline_id == Discipline.id)
        .all()
    )
    
    events = []
    for sc in results:
        events.append({
            "id": sc.id,
            "date": sc.date,
            "order": sc.order,
            "mba_name": sc.config.mba.name,
            "discipline_name": sc.config.discipline.name,
            "color": "blue" # Poderia ser dinâmico por MBA futuramente
        })
    return events
