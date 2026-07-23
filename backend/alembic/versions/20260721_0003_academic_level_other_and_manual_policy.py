"""add academic_level_other field, OUTRO academic level and MANUAL holiday policy

Revision ID: 20260721_0003
Revises: 20260721_0002
Create Date: 2026-07-21

Migração não-destrutiva: adiciona a coluna `academic_level_other` em courses
(rótulo livre quando o professor escolhe "Outro" nível acadêmico) e amplia os
enums `academiclevel` (+ OUTRO) e `holidaypolicy` (+ MANUAL). Nenhuma linha ou
coluna existente é removida.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0003"
down_revision: Union[str, None] = "20260721_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("academic_level_other", sa.String(), nullable=True))

    if is_pg:
        # SQLite não tem tipos ENUM nomeados — os novos valores já são aceitos
        # (a coluna é armazenada como texto). No Postgres é preciso ampliar o
        # tipo existente.
        op.execute("ALTER TYPE academiclevel ADD VALUE IF NOT EXISTS 'OUTRO'")
        op.execute("ALTER TYPE holidaypolicy ADD VALUE IF NOT EXISTS 'MANUAL'")


def downgrade() -> None:
    # Remover valores de ENUM no Postgres exige recriar o tipo; como este é um
    # campo aditivo e não há como saber se dados já usam OUTRO/MANUAL, o
    # downgrade só remove a coluna (comportamento seguro e reversível).
    with op.batch_alter_table("courses") as batch:
        batch.drop_column("academic_level_other")
