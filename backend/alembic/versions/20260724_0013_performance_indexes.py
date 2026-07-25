"""add missing indexes on foreign keys hit by frequent queries

Revision ID: 20260724_0013
Revises: 20260723_0012
Create Date: 2026-07-24

Não-destrutiva: só adiciona índices (nenhuma coluna/dado é alterado). Postgres
não indexa colunas de FK automaticamente, e essas colunas são usadas em
WHERE/JOIN em quase toda listagem do sistema — sem índice, cada consulta
degrada para um full table scan à medida que o volume de dados cresce.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260724_0013"
down_revision: Union[str, None] = "20260723_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ("ix_modules_course_id", "modules", ["course_id"]),
    ("ix_disciplines_module_id", "disciplines", ["module_id"]),
    ("ix_schedule_configs_course_id", "schedule_configs", ["course_id"]),
    ("ix_schedule_configs_module_id", "schedule_configs", ["module_id"]),
    ("ix_schedule_configs_discipline_id", "schedule_configs", ["discipline_id"]),
    ("ix_scheduled_classes_config_id", "scheduled_classes", ["config_id"]),
    ("ix_scheduled_classes_date", "scheduled_classes", ["date"]),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
