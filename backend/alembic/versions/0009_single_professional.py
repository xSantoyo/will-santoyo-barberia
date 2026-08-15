"""Colapso a un solo profesional: renombrados (NO destructivo).

Refactor de plataforma multi-barbero a la agenda personal de Will.
Esta migración solo RENOMBRA tablas, columnas, índices y constraints: ninguna
fila se pierde y el `downgrade` la revierte por completo.

En Postgres, renombrar una columna es transparente para los constraints que la
referencian: el EXCLUDE `no_double_booking` sigue vigente sobre la columna
renombrada sin necesidad de recrearlo.

Los DROP de columnas y tablas viven en la migración 0010, que requiere
aprobación explícita del dueño (ver REFACTOR_PLAN.md §8).

Revision ID: 0009
"""
from __future__ import annotations

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

_IS_PG = "postgresql"


def upgrade() -> None:
    bind = op.get_bind()

    # --- appointments.barber_id -> professional_id -------------------------
    with op.batch_alter_table("appointments") as batch:
        batch.alter_column("barber_id", new_column_name="professional_id")

    # --- reviews.barber_id -> professional_id ------------------------------
    with op.batch_alter_table("reviews") as batch:
        batch.alter_column("barber_id", new_column_name="professional_id")

    # --- barber_time_off -> time_off ---------------------------------------
    with op.batch_alter_table("barber_time_off") as batch:
        batch.alter_column("barber_id", new_column_name="professional_id")
    op.rename_table("barber_time_off", "time_off")

    # --- barbers -> professional -------------------------------------------
    with op.batch_alter_table("barbers") as batch:
        batch.alter_column("specialty", new_column_name="headline")
    op.rename_table("barbers", "professional")

    # --- índices y constraints (nombres, solo Postgres) --------------------
    if bind.dialect.name == _IS_PG:
        op.execute(
            "ALTER INDEX IF EXISTS ix_appointments_barber_start "
            "RENAME TO ix_appointments_professional_start"
        )
        op.execute(
            "ALTER TABLE time_off RENAME CONSTRAINT uq_barber_time_off TO uq_time_off"
        )

    # --- media_assets: la categoría 'barber' pasa a 'profile' --------------
    # Solo cambia la etiqueta; el s3_key (y por tanto el archivo) no se toca.
    op.execute("UPDATE media_assets SET kind = 'profile' WHERE kind = 'barber'")


def downgrade() -> None:
    bind = op.get_bind()

    op.execute("UPDATE media_assets SET kind = 'barber' WHERE kind = 'profile'")

    if bind.dialect.name == _IS_PG:
        op.execute(
            "ALTER TABLE time_off RENAME CONSTRAINT uq_time_off TO uq_barber_time_off"
        )
        op.execute(
            "ALTER INDEX IF EXISTS ix_appointments_professional_start "
            "RENAME TO ix_appointments_barber_start"
        )

    op.rename_table("professional", "barbers")
    with op.batch_alter_table("barbers") as batch:
        batch.alter_column("headline", new_column_name="specialty")

    op.rename_table("time_off", "barber_time_off")
    with op.batch_alter_table("barber_time_off") as batch:
        batch.alter_column("professional_id", new_column_name="barber_id")

    with op.batch_alter_table("reviews") as batch:
        batch.alter_column("professional_id", new_column_name="barber_id")

    with op.batch_alter_table("appointments") as batch:
        batch.alter_column("professional_id", new_column_name="barber_id")
