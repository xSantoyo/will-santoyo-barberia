"""Seguridad: eventos de seguridad + throttle de login con bloqueo temporal

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

TZDT = sa.DateTime(timezone=True)
JsonCol = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "security_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer,
                  sa.ForeignKey("tenants.id", name="fk_security_events_tenant")),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("username", sa.String(60)),
        sa.Column("ip", sa.String(45)),
        sa.Column("detail", JsonCol, nullable=False, server_default="{}"),
        sa.Column("created_at", TZDT, nullable=False),
    )
    op.create_index("ix_security_events_kind_created", "security_events",
                    ["kind", "created_at"])
    op.create_index("ix_security_events_tenant_created", "security_events",
                    ["tenant_id", "created_at"])

    op.create_table(
        "login_throttles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("scope", sa.String(10), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("failures", sa.Integer, nullable=False, server_default="0"),
        sa.Column("lockout_level", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", TZDT),
        sa.Column("last_failure_at", TZDT),
        sa.Column("updated_at", TZDT, nullable=False),
        sa.UniqueConstraint("scope", "key", name="uq_login_throttle"),
    )


def downgrade() -> None:
    op.drop_table("login_throttles")
    op.drop_index("ix_security_events_tenant_created", "security_events")
    op.drop_index("ix_security_events_kind_created", "security_events")
    op.drop_table("security_events")
