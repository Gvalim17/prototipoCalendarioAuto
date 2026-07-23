"""rename MBA to Course, add academic fields and new schedule params

Revision ID: 20260721_0002
Revises: 20260709_0001
Create Date: 2026-07-21

Migração NÃO-destrutiva: renomeia mbas -> courses, renomeia as FKs mba_id ->
course_id, adiciona os novos campos (instituição, nível, semestre, faixa de
datas, dias da semana, horários, política de feriado) e faz o backfill dos
dados existentes. Nenhuma linha é removida.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0002"
down_revision: Union[str, None] = "20260709_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


academic_level = sa.Enum(
    "GRADUACAO", "POS_GRADUACAO", "MBA", "EXTENSAO", "TECNICO",
    name="academiclevel", create_type=False,
)
holiday_policy = sa.Enum(
    "RESCHEDULE", "SKIP",
    name="holidaypolicy", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # Enums são tipos nomeados no Postgres — criar antes de usar.
    if is_pg:
        academic_level.create(bind, checkfirst=True)
        holiday_policy.create(bind, checkfirst=True)

    # Proteção defensiva: se uma tabela `courses` vazia já existir (ex.: criada
    # por engano via Base.metadata.create_all rodando com o código novo antes
    # desta migração ser aplicada), remove-a para liberar o rename abaixo.
    # Nunca remove se houver qualquer linha, para não arriscar dados reais.
    inspector = sa.inspect(bind)
    if "courses" in inspector.get_table_names():
        existing_rows = bind.execute(sa.text("SELECT COUNT(*) FROM courses")).scalar()
        if existing_rows == 0:
            op.drop_table("courses")
        else:
            raise RuntimeError(
                "Tabela 'courses' já existe e contém dados — migração abortada "
                "para evitar perda de dados. Investigue manualmente antes de prosseguir."
            )

    # 1) Renomear a tabela principal.
    op.rename_table("mbas", "courses")

    # 2) Novos campos em courses + backfill.
    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("institution", sa.String(), nullable=True))
        batch.add_column(sa.Column("academic_level", academic_level, nullable=True))
        batch.add_column(sa.Column("semester", sa.Integer(), nullable=True))
    op.execute("UPDATE courses SET academic_level = 'MBA' WHERE academic_level IS NULL")
    with op.batch_alter_table("courses") as batch:
        batch.alter_column("academic_level", existing_type=academic_level, nullable=False)

    # 3) modules.mba_id -> course_id (preservando os vínculos).
    with op.batch_alter_table("modules") as batch:
        batch.add_column(sa.Column("course_id", sa.Integer(), nullable=True))
    op.execute("UPDATE modules SET course_id = mba_id")
    with op.batch_alter_table("modules") as batch:
        batch.alter_column("course_id", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("mba_id")
        batch.create_foreign_key("fk_modules_course_id", "courses", ["course_id"], ["id"])

    # 4) schedule_configs: renomear FK e adicionar novos parâmetros de cronograma.
    with op.batch_alter_table("schedule_configs") as batch:
        batch.add_column(sa.Column("course_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("end_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("days_of_week", sa.String(), nullable=True))
        batch.add_column(sa.Column("start_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("end_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("holiday_policy", holiday_policy, nullable=True))

    # Backfill dos dados existentes.
    op.execute("UPDATE schedule_configs SET course_id = mba_id")
    op.execute("UPDATE schedule_configs SET days_of_week = CAST(day_of_week AS TEXT) WHERE day_of_week IS NOT NULL")
    op.execute("UPDATE schedule_configs SET holiday_policy = 'RESCHEDULE' WHERE holiday_policy IS NULL")
    op.execute(
        "UPDATE schedule_configs SET end_date = ("
        "SELECT MAX(sc.date) FROM scheduled_classes sc WHERE sc.config_id = schedule_configs.id"
        ") WHERE end_date IS NULL"
    )
    op.execute("UPDATE schedule_configs SET end_date = start_date WHERE end_date IS NULL")

    with op.batch_alter_table("schedule_configs") as batch:
        batch.alter_column("course_id", existing_type=sa.Integer(), nullable=False)
        batch.alter_column("holiday_policy", existing_type=holiday_policy, nullable=False)
        # workload e num_classes passam a ser derivados/opcionais.
        batch.alter_column("workload", existing_type=sa.Integer(), nullable=True)
        batch.alter_column("num_classes", existing_type=sa.Integer(), nullable=True)
        # day_of_week vira legado (mantido, mas opcional).
        batch.alter_column("day_of_week", existing_type=sa.Integer(), nullable=True)
        batch.drop_column("mba_id")
        batch.create_foreign_key("fk_schedule_configs_course_id", "courses", ["course_id"], ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    with op.batch_alter_table("schedule_configs") as batch:
        batch.add_column(sa.Column("mba_id", sa.Integer(), nullable=True))
    op.execute("UPDATE schedule_configs SET mba_id = course_id")
    with op.batch_alter_table("schedule_configs") as batch:
        batch.drop_constraint("fk_schedule_configs_course_id", type_="foreignkey")
        batch.drop_column("course_id")
        batch.drop_column("holiday_policy")
        batch.drop_column("end_time")
        batch.drop_column("start_time")
        batch.drop_column("days_of_week")
        batch.drop_column("end_date")

    with op.batch_alter_table("modules") as batch:
        batch.add_column(sa.Column("mba_id", sa.Integer(), nullable=True))
    op.execute("UPDATE modules SET mba_id = course_id")
    with op.batch_alter_table("modules") as batch:
        batch.drop_constraint("fk_modules_course_id", type_="foreignkey")
        batch.drop_column("course_id")

    with op.batch_alter_table("courses") as batch:
        batch.drop_column("semester")
        batch.drop_column("academic_level")
        batch.drop_column("institution")

    op.rename_table("courses", "mbas")

    if is_pg:
        holiday_policy.drop(bind, checkfirst=True)
        academic_level.drop(bind, checkfirst=True)
