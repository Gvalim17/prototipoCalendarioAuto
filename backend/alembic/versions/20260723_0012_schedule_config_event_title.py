"""add event_title to schedule_configs

Revision ID: 20260723_0012
Revises: 20260723_0011
Create Date: 2026-07-23

Não-destrutiva: adiciona `event_title` (nullable) em schedule_configs — nome
livre do evento, usado quando recurrence="na" ("Evento único") para o
professor descrever do que se trata (ex.: "Palestra sobre Ética em IA").
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0012"
down_revision: Union[str, None] = "20260723_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("schedule_configs") as batch:
        batch.add_column(sa.Column("event_title", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("schedule_configs") as batch:
        batch.drop_column("event_title")
