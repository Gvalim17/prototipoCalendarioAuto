"""Configuração compartilhada dos testes de API: banco SQLite isolado em
arquivo temporário, para não tocar em `sql_app.db` nem em produção."""

import os
import tempfile

_TMP_DB_PATH = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB_PATH}"
os.environ.setdefault("AUTO_CREATE_TABLES", "true")
os.environ.setdefault("ALLOW_SELF_REGISTRATION", "true")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COOKIE_SAMESITE", "lax")
os.environ.pop("BOOTSTRAP_ADMIN_EMAIL", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_database():
    """Esvazia todas as tabelas entre testes (mais rápido que recriar o
    schema inteiro) para que cada teste comece com o banco vazio."""
    yield
    with engine.connect() as connection:
        transaction = connection.begin()
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
        transaction.commit()


@pytest.fixture()
def client():
    return TestClient(app)
