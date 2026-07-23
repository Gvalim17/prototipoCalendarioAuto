"""initial schema

Revision ID: 20260709_0001
Revises:
Create Date: 2026-07-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260709_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


delivery_format = sa.Enum("PRESENCIAL", "REMOTO", name="deliveryformat")
recurrence_type = sa.Enum("SEMANAL", "QUINZENAL", "NA", name="recurrencetype")


def upgrade() -> None:
    op.create_table(
        "mbas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_mbas_id"), "mbas", ["id"], unique=False)

    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date"),
    )
    op.create_index(op.f("ix_holidays_id"), "holidays", ["id"], unique=False)

    op.create_table(
        "recesses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recesses_id"), "recesses", ["id"], unique=False)

    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("mba_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["mba_id"], ["mbas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_modules_id"), "modules", ["id"], unique=False)

    op.create_table(
        "disciplines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_disciplines_id"), "disciplines", ["id"], unique=False)

    op.create_table(
        "schedule_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("mba_id", sa.Integer(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("format", delivery_format, nullable=False),
        sa.Column("workload", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("recurrence", recurrence_type, nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("num_classes", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"]),
        sa.ForeignKeyConstraint(["mba_id"], ["mbas.id"]),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_schedule_configs_id"), "schedule_configs", ["id"], unique=False)

    op.create_table(
        "scheduled_classes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("config_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["config_id"], ["schedule_configs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scheduled_classes_id"), "scheduled_classes", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scheduled_classes_id"), table_name="scheduled_classes")
    op.drop_table("scheduled_classes")
    op.drop_index(op.f("ix_schedule_configs_id"), table_name="schedule_configs")
    op.drop_table("schedule_configs")
    op.drop_index(op.f("ix_disciplines_id"), table_name="disciplines")
    op.drop_table("disciplines")
    op.drop_index(op.f("ix_modules_id"), table_name="modules")
    op.drop_table("modules")
    op.drop_index(op.f("ix_recesses_id"), table_name="recesses")
    op.drop_table("recesses")
    op.drop_index(op.f("ix_holidays_id"), table_name="holidays")
    op.drop_table("holidays")
    op.drop_index(op.f("ix_mbas_id"), table_name="mbas")
    op.drop_table("mbas")
    recurrence_type.drop(op.get_bind(), checkfirst=True)
    delivery_format.drop(op.get_bind(), checkfirst=True)
