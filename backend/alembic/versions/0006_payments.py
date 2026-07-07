"""Pasarela de pagos (Wompi + simulador): anticipos y regalos en línea

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

TZDT = sa.DateTime(timezone=True)
JsonCol = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(60), nullable=False, unique=True, index=True),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="COP"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pendiente",
                  index=True),
        sa.Column("provider", sa.String(20), nullable=False, server_default="mock"),
        sa.Column("provider_transaction_id", sa.String(80)),
        sa.Column("payment_method", sa.String(40)),
        sa.Column("appointment_id", sa.Integer,
                  sa.ForeignKey("appointments.id", name="fk_payments_appointment"),
                  index=True),
        sa.Column("gift_code_id", sa.Integer),
        sa.Column("payer_name", sa.String(120)),
        sa.Column("payer_whatsapp", sa.String(20)),
        sa.Column("detail", JsonCol, nullable=False, server_default="{}"),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("updated_at", TZDT, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("payments")
