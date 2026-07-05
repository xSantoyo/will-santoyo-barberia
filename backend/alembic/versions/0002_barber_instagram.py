"""Instagram por barbero (feedback ronda 1): visible en su tarjeta pública

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("barbers", sa.Column("instagram", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("barbers", "instagram")
