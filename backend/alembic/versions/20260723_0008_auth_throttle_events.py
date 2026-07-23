"""add auth_throttle_events table for DB-backed rate limiting

Revision ID: 20260723_0008
Revises: 20260722_0007
Create Date: 2026-07-23

Substitui os dicionários em memória usados para limitar tentativas de
login/registro/recuperação de senha por uma tabela — funciona corretamente
com múltiplos workers/instâncias, o que a versão em memória do processo não
garantia.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0008"
down_revision: Union[str, None] = "20260722_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_throttle_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_auth_throttle_events_key", "auth_throttle_events", ["key"])
    op.create_index("ix_auth_throttle_events_kind", "auth_throttle_events", ["kind"])
    op.create_index("ix_auth_throttle_events_created_at", "auth_throttle_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_auth_throttle_events_created_at", table_name="auth_throttle_events")
    op.drop_index("ix_auth_throttle_events_kind", table_name="auth_throttle_events")
    op.drop_index("ix_auth_throttle_events_key", table_name="auth_throttle_events")
    op.drop_table("auth_throttle_events")
