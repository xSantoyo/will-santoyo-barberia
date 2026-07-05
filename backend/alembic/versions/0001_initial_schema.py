"""Esquema inicial multi-tenant + constraint anti doble-reserva (ADR-003)

Revision ID: 0001
Revises:
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JsonCol = sa.JSON().with_variant(JSONB(), "postgresql")
TZDT = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False, unique=True, index=True),
        sa.Column("whatsapp_number", sa.String(20)),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="America/Bogota"),
        sa.Column("brand_config", JsonCol, nullable=False, server_default="{}"),
        sa.Column("business_hours", JsonCol, nullable=False, server_default="{}"),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("updated_at", TZDT, nullable=False),
    )

    op.create_table(
        "barbers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("photo_key", sa.String(300)),
        sa.Column("specialty", sa.String(200)),
        sa.Column("schedule", JsonCol, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("updated_at", TZDT, nullable=False),
    )

    op.create_table(
        "barber_time_off",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("barber_id", sa.Integer, sa.ForeignKey("barbers.id"), nullable=False,
                  index=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("reason", sa.String(200)),
        sa.UniqueConstraint("barber_id", "date", name="uq_barber_time_off"),
    )

    op.create_table(
        "services",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price_cop", sa.Integer, nullable=False),
        sa.Column("duration_min", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("updated_at", TZDT, nullable=False),
    )

    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("barber_id", sa.Integer, sa.ForeignKey("barbers.id"), nullable=False,
                  index=True),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("customer_whatsapp", sa.String(20), nullable=False, index=True),
        sa.Column("starts_at", TZDT, nullable=False),
        sa.Column("ends_at", TZDT, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="confirmado",
                  index=True),
        sa.Column("daily_number", sa.Integer, nullable=False),
        sa.Column("manage_code", sa.String(12), nullable=False, unique=True, index=True),
        sa.Column("notes", sa.Text),
        sa.Column("cancel_reason", sa.String(300)),
        sa.Column("cancelled_at", TZDT),
        sa.Column("created_at", TZDT, nullable=False),
        sa.Column("updated_at", TZDT, nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name="ck_appointment_range"),
    )
    op.create_index("ix_appointments_tenant_start", "appointments", ["tenant_id", "starts_at"])
    op.create_index("ix_appointments_barber_start", "appointments", ["barber_id", "starts_at"])

    # --- Prevención de doble-reserva A NIVEL DE BASE DE DATOS (solo Postgres) ---
    # Dos turnos activos del mismo barbero no pueden solapar sus rangos horarios.
    # La app también valida, pero este constraint gana cualquier condición de
    # carrera entre requests concurrentes.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
        op.execute(
            """
            ALTER TABLE appointments ADD CONSTRAINT no_double_booking
            EXCLUDE USING gist (
                barber_id WITH =,
                tstzrange(starts_at, ends_at) WITH &&
            ) WHERE (status IN ('pendiente', 'confirmado', 'en_curso'))
            """
        )

    op.create_table(
        "appointment_services",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("appointment_id", sa.Integer,
                  sa.ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False,
                  index=True),
        sa.Column("service_id", sa.Integer, sa.ForeignKey("services.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price_cop", sa.Integer, nullable=False),
        sa.Column("duration_min", sa.Integer, nullable=False),
    )

    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("username", sa.String(60), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="admin"),
        sa.Column("barber_id", sa.Integer, sa.ForeignKey("barbers.id")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("token_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZDT, nullable=False),
        sa.UniqueConstraint("tenant_id", "username", name="uq_admin_users_username"),
    )

    op.create_table(
        "media_assets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("s3_key", sa.String(300), nullable=False, unique=True),
        sa.Column("title", sa.String(200)),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZDT, nullable=False),
    )
    op.create_index("ix_media_assets_tenant_kind", "media_assets", ["tenant_id", "kind"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False,
                  index=True),
        sa.Column("actor_user_id", sa.Integer, sa.ForeignKey("admin_users.id")),
        sa.Column("actor_username", sa.String(60), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("entity", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.Integer),
        sa.Column("payload", JsonCol, nullable=False, server_default="{}"),
        sa.Column("created_at", TZDT, nullable=False),
    )


def downgrade() -> None:
    for table in (
        "audit_log", "media_assets", "admin_users",
        "appointment_services", "appointments", "services", "barber_time_off",
        "barbers", "tenants",
    ):
        op.drop_table(table)
