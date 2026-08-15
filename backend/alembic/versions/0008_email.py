"""Correos transaccionales (Resend): email opcional del cliente y marcas de envío

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

TZDT = sa.DateTime(timezone=True)


def upgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.add_column(sa.Column("customer_email", sa.String(200)))
        batch.add_column(sa.Column("confirmation_email_sent_at", TZDT))
        batch.add_column(sa.Column("reminder_email_sent_at", TZDT))
    with op.batch_alter_table("payments") as batch:
        batch.add_column(sa.Column("payer_email", sa.String(200)))


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch:
        batch.drop_column("payer_email")
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("reminder_email_sent_at")
        batch.drop_column("confirmation_email_sent_at")
        batch.drop_column("customer_email")
