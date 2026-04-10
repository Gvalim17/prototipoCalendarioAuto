from sqlalchemy import Column, Integer, String, Date, ForeignKey, Enum, Boolean, Table
from sqlalchemy.orm import relationship, declarative_base
import enum

Base = declarative_base()

class DeliveryFormat(enum.Enum):
    PRESENCIAL = "presencial"
    REMOTO = "remoto"

class RecurrenceType(enum.Enum):
    SEMANAL = "semanal"
    QUINZENAL = "quinzenal"
    NA = "na"

# Tabela de associação para Disciplinas e Módulos (N:N se necessário, mas aqui 1:N conforme regra)
# "Módulos vinculados ao MBA, Disciplinas vinculadas aos módulos"
class MBA(Base):
    __tablename__ = "mbas"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    year = Column(Integer, default=2026)
    
    modules = relationship("Module", back_populates="mba", cascade="all, delete-orphan")

class Module(Base):
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    mba_id = Column(Integer, ForeignKey("mbas.id"))
    
    mba = relationship("MBA", back_populates="modules")
    disciplines = relationship("Discipline", back_populates="module", cascade="all, delete-orphan")

class Discipline(Base):
    __tablename__ = "disciplines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True) # Sigla ou código da disciplina
    module_id = Column(Integer, ForeignKey("modules.id"))
    
    module = relationship("Module", back_populates="disciplines")

class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False)
    description = Column(String, nullable=False)
    type = Column(String, default="nacional") # nacional, estadual, uerj
    source = Column(String, default="UERJ")

class Recess(Base):
    __tablename__ = "recesses"
    id = Column(Integer, primary_key=True, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    description = Column(String)
    source = Column(String, default="UERJ")

class ScheduleConfig(Base):
    __tablename__ = "schedule_configs"
    id = Column(Integer, primary_key=True, index=True)
    mba_id = Column(Integer, ForeignKey("mbas.id"))
    module_id = Column(Integer, ForeignKey("modules.id"))
    discipline_id = Column(Integer, ForeignKey("disciplines.id"))
    
    format = Column(Enum(DeliveryFormat), nullable=False)
    workload = Column(Integer, nullable=False) # Carga horária
    start_date = Column(Date, nullable=False)
    recurrence = Column(Enum(RecurrenceType), nullable=False)
    day_of_week = Column(Integer, nullable=False) # 0-6 (Seg-Dom)
    num_classes = Column(Integer, nullable=False)
    
    # Relacionamentos para facilitar consultas
    mba = relationship("MBA")
    module = relationship("Module")
    discipline = relationship("Discipline")

class ScheduledClass(Base):
    __tablename__ = "scheduled_classes"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("schedule_configs.id"))
    date = Column(Date, nullable=False)
    order = Column(Integer) # Aula 1, 2, 3...
    
    config = relationship("ScheduleConfig", back_populates="classes")

# Adicionar o back_populates no ScheduleConfig
ScheduleConfig.classes = relationship("ScheduledClass", back_populates="config", cascade="all, delete-orphan")
