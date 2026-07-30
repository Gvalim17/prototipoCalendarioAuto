import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from .models.base import Base


load_dotenv()


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db").strip()
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return database_url


DATABASE_URL = get_database_url()
CONNECT_ARGS = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# pool_pre_ping + pool_recycle são essenciais com Postgres serverless (Neon):
# o provedor suspende/derruba conexões ociosas, e sem isso o SQLAlchemy tenta
# reusar uma conexão morta do pool — a requisição trava até o timeout de rede
# em vez de simplesmente abrir uma conexão nova. pool_pre_ping testa a conexão
# com um SELECT 1 barato antes de cada uso; pool_recycle força reciclagem
# antes que o servidor a feche por conta própria.
# pool_size/max_overflow ficam explícitos (em vez do default do SQLAlchemy)
# para o total de conexões ser previsível: cada worker do uvicorn tem seu
# próprio engine/pool (processos separados), então o teto real é
# (pool_size + max_overflow) × número de workers (ver WEB_CONCURRENCY em
# render.yaml). Se o número de workers crescer, use a connection string com
# sufixo "-pooler" do Neon em produção (ver .env.example).
POOL_KWARGS = {} if DATABASE_URL.startswith("sqlite") else {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "pool_size": 5,
    "max_overflow": 5,
}

engine = create_engine(DATABASE_URL, connect_args=CONNECT_ARGS, **POOL_KWARGS)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


if DATABASE_URL.startswith("sqlite"):
    # SQLite ignora ON DELETE CASCADE/SET NULL por padrão — precisa habilitar
    # a checagem de foreign keys por conexão. Sem isso, o comportamento em
    # dev/testes (SQLite) diverge silenciosamente do Postgres de produção,
    # onde os cascades já são aplicados pelo servidor.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def should_auto_create_tables() -> bool:
    configured = os.getenv("AUTO_CREATE_TABLES")
    if configured is not None:
        return configured.strip().lower() not in {"0", "false", "no"}

    # SQLite keeps the zero-config local workflow. PostgreSQL should be managed
    # by Alembic migrations to avoid creating tables outside version control.
    return DATABASE_URL.startswith("sqlite")


def init_db() -> None:
    if not should_auto_create_tables():
        return
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
