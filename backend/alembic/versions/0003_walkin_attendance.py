"""Tanda 2: walk-ins (teléfono opcional) + confirmación de asistencia

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table: en SQLite recrea la tabla; en Postgres es ALTER normal
    with op.batch_alter_table("appointments") as batch:
        batch.add_column(sa.Column("attendance_confirmed_at", sa.DateTime(timezone=True)))
        # Un walk-in puede no dejar teléfono: la reserva pública lo sigue exigiendo
        # a nivel de API (Pydantic), pero la columna deja de ser NOT NULL.
        batch.alter_column(
            "customer_whatsapp", existing_type=sa.String(20), nullable=True
        )


def downgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("attendance_confirmed_at")
        batch.alter_column(
            "customer_whatsapp", existing_type=sa.String(20), nullable=False
        )
