"""Tanda 4 (crecimiento): productos, códigos de regalo y referidos

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

TZDT = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(300)),
        sa.Column("price_cop", sa.Integer, nullable=False),
        sa.Column("photo_key", sa.String(300)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZDT, nullable=False),
    )

    op.create_table(
        "gift_codes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("code", sa.String(16), nullable=False, unique=True, index=True),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("created_by", sa.String(60), nullable=False),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("expires_at", TZDT),
        sa.Column("held_by_appointment_id", sa.Integer),  # sin FK: ciclo con appointments
        sa.Column("redeemed_at", TZDT),
    )

    op.create_table(
        "client_referral_codes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("customer_whatsapp", sa.String(20), nullable=False),
        sa.Column("code", sa.String(16), nullable=False, unique=True, index=True),
        sa.Column("created_at", TZDT, nullable=False),
        sa.UniqueConstraint("tenant_id", "customer_whatsapp", name="uq_referral_phone"),
    )

    with op.batch_alter_table("appointments") as batch:
        batch.add_column(sa.Column("referred_by_code", sa.String(20)))
        # FK con nombre explícito: el modo batch de SQLite lo exige
        batch.add_column(
            sa.Column(
                "gift_code_id",
                sa.Integer,
                sa.ForeignKey("gift_codes.id", name="fk_appointments_gift_code"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("gift_code_id")
        batch.drop_column("referred_by_code")
    op.drop_table("client_referral_codes")
    op.drop_table("gift_codes")
    op.drop_table("products")
