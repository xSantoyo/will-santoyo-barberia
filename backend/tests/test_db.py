"""Detección del pooler en modo transacción (compatibilidad Supabase/pgbouncer)."""
from __future__ import annotations

from app.db import _is_transaction_pooler


def test_transaction_pooler_detection():
    # Supavisor de Supabase (modo transacción, puerto 6543)
    assert _is_transaction_pooler(
        "postgresql+psycopg://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    )
    # pgbouncer señalado explícitamente
    assert _is_transaction_pooler("postgresql+psycopg://u:p@host:5432/db?pgbouncer=true")
    # Conexión directa (RDS, Supabase session mode 5432, local): pool normal
    assert not _is_transaction_pooler("postgresql+psycopg://u:p@host:5432/db")
    assert not _is_transaction_pooler(
        "postgresql+psycopg://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    )
    assert not _is_transaction_pooler("sqlite:///./dev.db")
