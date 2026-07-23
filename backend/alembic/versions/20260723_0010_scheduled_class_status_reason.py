"""add status and change_reason to scheduled_classes

Revision ID: 20260723_0010
Revises: 20260723_0009
Create Date: 2026-07-23

Não-destrutiva: adiciona colunas `status` (default "scheduled" para todas as
linhas existentes) e `change_reason` (nullable) em scheduled_classes, para
suportar edição pontual de dia (troca de data ou cancelamento) com motivo
obrigatório, sem bloqueio por feriado.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0010"
down_revision: Union[str, None] = "20260723_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

scheduled_class_status = sa.Enum("SCHEDULED", "CANCELLED", name="scheduledclassstatus")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        scheduled_class_status.create(bind, checkfirst=True)

    with op.batch_alter_table("scheduled_classes") as batch:
        batch.add_column(sa.Column(
            "status", scheduled_class_status, nullable=False,
            server_default="SCHEDULED",
        ))
        batch.add_column(sa.Column("change_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("scheduled_classes") as batch:
        batch.drop_column("change_reason")
        batch.drop_column("status")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        scheduled_class_status.drop(bind, checkfirst=True)
