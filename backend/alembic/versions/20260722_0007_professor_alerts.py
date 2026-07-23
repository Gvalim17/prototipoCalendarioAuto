"""add professor lesson alerts and schedule ownership

Revision ID: 20260722_0007
Revises: 20260722_0006
Create Date: 2026-07-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260722_0007"
down_revision: Union[str, None] = "20260722_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("schedule_configs") as batch:
        batch.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_schedule_configs_owner_id", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_schedule_configs_owner_id", "schedule_configs", ["owner_id"])
    op.create_table(
        "alert_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("minutes_before", sa.String(), nullable=False, server_default="1440,60"),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("timezone", sa.String(), nullable=False, server_default="America/Sao_Paulo"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_alert_preferences_user_id"),
    )
    op.create_index("ix_alert_preferences_user_id", "alert_preferences", ["user_id"])
    op.create_table(
        "alert_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheduled_class_id", sa.Integer(), sa.ForeignKey("scheduled_classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("minutes_before", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "scheduled_class_id", "channel", "minutes_before", name="uq_alert_delivery"),
    )
    op.create_index("ix_alert_notifications_user_id", "alert_notifications", ["user_id"])
    op.create_index("ix_alert_notifications_scheduled_class_id", "alert_notifications", ["scheduled_class_id"])


def downgrade() -> None:
    op.drop_index("ix_alert_notifications_scheduled_class_id", table_name="alert_notifications")
    op.drop_index("ix_alert_notifications_user_id", table_name="alert_notifications")
    op.drop_table("alert_notifications")
    op.drop_index("ix_alert_preferences_user_id", table_name="alert_preferences")
    op.drop_table("alert_preferences")
    op.drop_index("ix_schedule_configs_owner_id", table_name="schedule_configs")
    with op.batch_alter_table("schedule_configs") as batch:
        batch.drop_constraint("fk_schedule_configs_owner_id", type_="foreignkey")
        batch.drop_column("owner_id")
