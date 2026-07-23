import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
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

engine = create_engine(DATABASE_URL, connect_args=CONNECT_ARGS)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
