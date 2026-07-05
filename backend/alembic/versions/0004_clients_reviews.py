"""Tanda 3: notas de cliente (perfil por teléfono) + reseñas verificadas

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TZDT = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "client_notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("customer_whatsapp", sa.String(20), nullable=False),
        sa.Column("author_user_id", sa.Integer, sa.ForeignKey("admin_users.id")),
        sa.Column("author_name", sa.String(60), nullable=False),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("created_at", TZDT, nullable=False),
    )
    op.create_index(
        "ix_client_notes_tenant_phone", "client_notes", ["tenant_id", "customer_whatsapp"]
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("appointment_id", sa.Integer, sa.ForeignKey("appointments.id"),
                  nullable=False, unique=True, index=True),
        sa.Column("barber_id", sa.Integer, sa.ForeignKey("barbers.id"), nullable=False,
                  index=True),
        sa.Column("customer_whatsapp", sa.String(20)),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("comment", sa.String(500)),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", TZDT, nullable=False),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating"),
    )


def downgrade() -> None:
    op.drop_table("reviews")
    op.drop_index("ix_client_notes_tenant_phone", table_name="client_notes")
    op.drop_table("client_notes")
