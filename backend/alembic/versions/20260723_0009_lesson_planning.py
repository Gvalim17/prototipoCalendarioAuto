"""add lesson planning (PTD, per-class roteiro, attachments) and calendar token

Revision ID: 20260723_0009
Revises: 20260723_0008
Create Date: 2026-07-23

Não-destrutiva: cria tabelas novas (lesson_plans, lesson_scripts,
lesson_attachments) e uma coluna nova em users (calendar_token_hash,
nullable). Nenhuma tabela ou coluna existente é alterada.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0009"
down_revision: Union[str, None] = "20260723_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("calendar_token_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_users_calendar_token_hash", "users", ["calendar_token_hash"], unique=True)

    op.create_table(
        "lesson_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discipline_id", sa.Integer(), sa.ForeignKey("disciplines.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ementa", sa.Text(), nullable=True),
        sa.Column("objetivos", sa.Text(), nullable=True),
        sa.Column("conteudo_programatico", sa.Text(), nullable=True),
        sa.Column("metodologia", sa.Text(), nullable=True),
        sa.Column("recursos_didaticos", sa.Text(), nullable=True),
        sa.Column("criterios_avaliacao", sa.Text(), nullable=True),
        sa.Column("bibliografia", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_lesson_plans_discipline_id", "lesson_plans", ["discipline_id"])

    op.create_table(
        "lesson_scripts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scheduled_class_id", sa.Integer(), sa.ForeignKey("scheduled_classes.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_lesson_scripts_scheduled_class_id", "lesson_scripts", ["scheduled_class_id"])

    op.create_table(
        "lesson_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_script_id", sa.Integer(), sa.ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_lesson_attachments_lesson_script_id", "lesson_attachments", ["lesson_script_id"])


def downgrade() -> None:
    op.drop_index("ix_lesson_attachments_lesson_script_id", table_name="lesson_attachments")
    op.drop_table("lesson_attachments")
    op.drop_index("ix_lesson_scripts_scheduled_class_id", table_name="lesson_scripts")
    op.drop_table("lesson_scripts")
    op.drop_index("ix_lesson_plans_discipline_id", table_name="lesson_plans")
    op.drop_table("lesson_plans")
    op.drop_index("ix_users_calendar_token_hash", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("calendar_token_hash")
