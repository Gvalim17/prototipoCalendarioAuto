"""add lesson_share_links table

Revision ID: 20260729_0014
Revises: 20260724_0013
Create Date: 2026-07-29

Não-destrutiva: cria apenas a tabela nova lesson_share_links, usada para
links públicos (sem login) de compartilhamento dos anexos de uma aula.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260729_0014"
down_revision: Union[str, None] = "20260724_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lesson_share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_script_id", sa.Integer(), sa.ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_lesson_share_links_lesson_script_id", "lesson_share_links", ["lesson_script_id"])
    op.create_index("ix_lesson_share_links_token_hash", "lesson_share_links", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_lesson_share_links_token_hash", table_name="lesson_share_links")
    op.drop_index("ix_lesson_share_links_lesson_script_id", table_name="lesson_share_links")
    op.drop_table("lesson_share_links")
