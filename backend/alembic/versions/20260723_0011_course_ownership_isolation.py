"""add owner_id to courses/modules/disciplines for per-professor isolation

Revision ID: 20260723_0011
Revises: 20260723_0010
Create Date: 2026-07-23

Não-destrutiva quanto a dados: adiciona owner_id (nullable, FK users.id
ON DELETE SET NULL) em courses, modules e disciplines. Cursos/módulos/
disciplinas já existentes ficam com owner_id nulo (visíveis só para admin,
até serem reivindicados por um professor via edição — mesmo padrão já usado
em ScheduleConfig).

Também troca a unicidade de courses.name e disciplines.code de global para
por-dono (permite que professores diferentes usem o mesmo nome de curso ou
código de disciplina em seus próprios catálogos).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0011"
down_revision: Union[str, None] = "20260723_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch.drop_constraint("mbas_name_key", type_="unique")
        batch.create_foreign_key("fk_courses_owner_id", "users", ["owner_id"], ["id"], ondelete="SET NULL")
        batch.create_unique_constraint("uq_courses_owner_name", ["owner_id", "name"])
    op.create_index("ix_courses_owner_id", "courses", ["owner_id"])

    with op.batch_alter_table("modules") as batch:
        batch.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_modules_owner_id", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_modules_owner_id", "modules", ["owner_id"])

    with op.batch_alter_table("disciplines") as batch:
        batch.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch.drop_constraint("disciplines_code_key", type_="unique")
        batch.create_foreign_key("fk_disciplines_owner_id", "users", ["owner_id"], ["id"], ondelete="SET NULL")
        batch.create_unique_constraint("uq_disciplines_owner_code", ["owner_id", "code"])
    op.create_index("ix_disciplines_owner_id", "disciplines", ["owner_id"])


def downgrade() -> None:
    with op.batch_alter_table("disciplines") as batch:
        batch.drop_constraint("uq_disciplines_owner_code", type_="unique")
        batch.drop_constraint("fk_disciplines_owner_id", type_="foreignkey")
        batch.create_unique_constraint("disciplines_code_key", ["code"])
        batch.drop_column("owner_id")
    op.drop_index("ix_disciplines_owner_id", table_name="disciplines")

    with op.batch_alter_table("modules") as batch:
        batch.drop_constraint("fk_modules_owner_id", type_="foreignkey")
        batch.drop_column("owner_id")
    op.drop_index("ix_modules_owner_id", table_name="modules")

    with op.batch_alter_table("courses") as batch:
        batch.drop_constraint("uq_courses_owner_name", type_="unique")
        batch.drop_constraint("fk_courses_owner_id", type_="foreignkey")
        batch.create_unique_constraint("mbas_name_key", ["name"])
        batch.drop_column("owner_id")
    op.drop_index("ix_courses_owner_id", table_name="courses")
