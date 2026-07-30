from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, Time, Enum, UniqueConstraint
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

class AcademicLevel(enum.Enum):
    GRADUACAO = "graduacao"
    POS_GRADUACAO = "pos_graduacao"
    MBA = "mba"
    EXTENSAO = "extensao"
    TECNICO = "tecnico"
    OUTRO = "outro"

class HolidayPolicy(enum.Enum):
    RESCHEDULE = "reschedule"  # Remarcar automaticamente (sistema sugere a data de reposição)
    MANUAL = "manual"          # Remarcar manualmente (professor escolhe a data de reposição)
    SKIP = "skip"              # Não remarcar: perde o dia e recalcula o total


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True)
    google_subject = Column(String, unique=True, nullable=True, index=True)
    role = Column(String, nullable=False, default="professor")
    created_at = Column(DateTime, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    privacy_accepted_at = Column(DateTime, nullable=True)
    privacy_policy_version = Column(String, nullable=True)
    calendar_token_hash = Column(String(64), unique=True, nullable=True, index=True)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    csrf_token_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False)

    user = relationship("User", back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    user = relationship("User")


class AuthThrottleEvent(Base):
    """Registra tentativas de autenticação sensíveis (login/registro/reset) para
    limitar taxa de forma compartilhada entre processos/instâncias — um dict em
    memória do processo não funciona com múltiplos workers."""
    __tablename__ = "auth_throttle_events"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), nullable=False, index=True)
    kind = Column(String(20), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, index=True)


class AlertPreference(Base):
    __tablename__ = "alert_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    minutes_before = Column(String, nullable=False, default="1440,60")
    in_app_enabled = Column(Boolean, nullable=False, default=True)
    email_enabled = Column(Boolean, nullable=False, default=False)
    timezone = Column(String, nullable=False, default="America/Sao_Paulo")
    updated_at = Column(DateTime, nullable=False)

    user = relationship("User")

    @property
    def offsets(self) -> list[int]:
        return [int(value) for value in self.minutes_before.split(",") if value.strip().isdigit()]


class AlertNotification(Base):
    __tablename__ = "alert_notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "scheduled_class_id", "channel", "minutes_before", name="uq_alert_delivery"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_class_id = Column(Integer, ForeignKey("scheduled_classes.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String, nullable=False)  # in_app | email
    minutes_before = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="sent")  # sent | failed
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    scheduled_for = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False)

    user = relationship("User")
    scheduled_class = relationship("ScheduledClass")

# Hierarquia acadêmica: Curso -> Módulo -> Disciplina
# (o nível "Módulo" é opcional na UI para graduações que não o utilizam)
class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_courses_owner_name"),)
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    institution = Column(String, nullable=True)
    academic_level = Column(Enum(AcademicLevel), nullable=False, default=AcademicLevel.MBA)
    academic_level_other = Column(String, nullable=True)  # rótulo livre quando academic_level == OUTRO
    description = Column(String)
    year = Column(Integer, default=2026)
    semester = Column(Integer, nullable=True)  # 1 ou 2, quando houver
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    modules = relationship("Module", back_populates="course", cascade="all, delete-orphan")
    owner = relationship("User")

class Module(Base):
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    # Denormalizado a partir de course.owner_id na criação — evita join extra
    # em toda checagem de posse/listagem, no mesmo padrão do owner_id em
    # ScheduleConfig/LessonPlan/LessonScript.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    course = relationship("Course", back_populates="modules")
    disciplines = relationship("Discipline", back_populates="module", cascade="all, delete-orphan")

class Discipline(Base):
    __tablename__ = "disciplines"
    __table_args__ = (UniqueConstraint("owner_id", "code", name="uq_disciplines_owner_code"),)
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)  # Sigla ou código da disciplina
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    module = relationship("Module", back_populates="disciplines")

class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False)
    description = Column(String, nullable=False)
    type = Column(String, default="nacional")  # nacional, estadual, institucional
    source = Column(String, default="Institucional")

class Recess(Base):
    __tablename__ = "recesses"
    id = Column(Integer, primary_key=True, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    description = Column(String)
    source = Column(String, default="Institucional")

class ScheduleConfig(Base):
    __tablename__ = "schedule_configs"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    discipline_id = Column(Integer, ForeignKey("disciplines.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    format = Column(Enum(DeliveryFormat), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    recurrence = Column(Enum(RecurrenceType), nullable=False)
    days_of_week = Column(String, nullable=True)   # CSV de inteiros 0-6, ex: "0,2,4"
    day_of_week = Column(Integer, nullable=True)   # Legado (mantido por compat. de dados)
    start_time = Column(Time, nullable=True)       # Horário de início da aula
    end_time = Column(Time, nullable=True)         # Horário de término da aula
    holiday_policy = Column(Enum(HolidayPolicy), nullable=False, default=HolidayPolicy.RESCHEDULE)
    workload = Column(Integer, nullable=True)      # Carga horária total (derivada)
    num_classes = Column(Integer, nullable=True)   # Quantidade de aulas (derivada)
    event_title = Column(String, nullable=True)    # Nome livre do evento (só para recurrence=NA, "Evento único")

    # Relacionamentos para facilitar consultas
    course = relationship("Course")
    module = relationship("Module")
    discipline = relationship("Discipline")
    owner = relationship("User")

    @property
    def days_list(self) -> list[int]:
        """Dias da semana (0=Segunda … 6=Domingo). Usa days_of_week (CSV) e
        recai no campo legado day_of_week quando o novo não estiver preenchido."""
        if self.days_of_week:
            return [int(x) for x in self.days_of_week.split(",") if x.strip() != ""]
        if self.day_of_week is not None:
            return [self.day_of_week]
        return []

class ScheduledClassStatus(enum.Enum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"

class ScheduledClass(Base):
    __tablename__ = "scheduled_classes"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("schedule_configs.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    order = Column(Integer, nullable=False)  # Aula 1, 2, 3...
    status = Column(Enum(ScheduledClassStatus), nullable=False, default=ScheduledClassStatus.SCHEDULED)
    change_reason = Column(Text, nullable=True)  # motivo da última alteração pontual (troca de dia ou cancelamento)

    config = relationship("ScheduleConfig", back_populates="classes")

# Adicionar o back_populates no ScheduleConfig
ScheduleConfig.classes = relationship("ScheduledClass", back_populates="config", cascade="all, delete-orphan")


class LessonPlan(Base):
    """Plano de Trabalho Docente (PTD) — um por disciplina, reaproveitado
    entre diferentes ofertas/cronogramas dessa mesma disciplina."""
    __tablename__ = "lesson_plans"

    id = Column(Integer, primary_key=True, index=True)
    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ementa = Column(Text, nullable=True)
    objetivos = Column(Text, nullable=True)
    conteudo_programatico = Column(Text, nullable=True)
    metodologia = Column(Text, nullable=True)
    recursos_didaticos = Column(Text, nullable=True)
    criterios_avaliacao = Column(Text, nullable=True)
    bibliografia = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)  # observações livres (markdown)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    discipline = relationship("Discipline")


class LessonScript(Base):
    """Roteiro de uma aula específica: tema do dia, atividades e materiais —
    vinculado a uma data concreta do cronograma (ScheduledClass)."""
    __tablename__ = "lesson_scripts"

    id = Column(Integer, primary_key=True, index=True)
    scheduled_class_id = Column(Integer, ForeignKey("scheduled_classes.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    topic = Column(String, nullable=True)
    content = Column(Text, nullable=True)  # markdown livre (atividades, roteiro)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    scheduled_class = relationship("ScheduledClass")
    attachments = relationship("LessonAttachment", back_populates="lesson_script", cascade="all, delete-orphan")


class LessonAttachment(Base):
    """Arquivo de apoio (slide, PDF, etc.) anexado a um roteiro de aula.
    Guardado no banco (bytes) — sem depender de armazenamento externo."""
    __tablename__ = "lesson_attachments"

    id = Column(Integer, primary_key=True, index=True)
    lesson_script_id = Column(Integer, ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, nullable=False)

    lesson_script = relationship("LessonScript", back_populates="attachments")


class LessonShareLink(Base):
    """Link público (token opaco) para o professor compartilhar os anexos de
    uma aula específica com os alunos, sem exigir login. Expira em 7 dias e
    pode ser revogado a qualquer momento — só o hash do token fica no banco."""
    __tablename__ = "lesson_share_links"

    id = Column(Integer, primary_key=True, index=True)
    lesson_script_id = Column(Integer, ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    lesson_script = relationship("LessonScript")
