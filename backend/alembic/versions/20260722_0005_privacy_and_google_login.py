"""add privacy consent and Google federated identity

Revision ID: 20260722_0005
Revises: 20260722_0004
Create Date: 2026-07-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260722_0005"
down_revision: Union[str, None] = "20260722_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(), nullable=True)
        batch.add_column(sa.Column("google_subject", sa.String(), nullable=True))
        batch.add_column(sa.Column("privacy_accepted_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("privacy_policy_version", sa.String(), nullable=True))
        batch.create_unique_constraint("uq_users_google_subject", ["google_subject"])
    op.create_index("ix_users_google_subject", "users", ["google_subject"])


def downgrade() -> None:
    op.drop_index("ix_users_google_subject", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_google_subject", type_="unique")
        batch.drop_column("privacy_policy_version")
        batch.drop_column("privacy_accepted_at")
        batch.drop_column("google_subject")
        batch.alter_column("password_hash", existing_type=sa.String(), nullable=False)
