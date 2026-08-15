"""Verificación del constraint de exclusión anti doble-reserva en PostgreSQL REAL.

Estos tests demuestran que aunque la validación de aplicación se salte
(INSERT directo), la base de datos rechaza el solapamiento (ADR-003).

Se ejecutan solo si TEST_POSTGRES_URL está definida:
    docker compose up -d db
    TEST_POSTGRES_URL=postgresql+psycopg://willsantoyo:willsantoyo@localhost:5432/willsantoyo pytest -m postgres
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, text

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL no definida"),
]


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_engine(POSTGRES_URL)
    # Aplicar migraciones Alembic contra el Postgres de prueba
    from alembic import command
    from alembic.config import Config

    os.environ["DATABASE_URL"] = POSTGRES_URL
    from app.config import get_settings

    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    yield engine
    engine.dispose()


def _insert_appointment(conn, tenant_id, professional_id, starts, ends, status="confirmado"):
    conn.execute(
        text(
            """
            INSERT INTO appointments
                (tenant_id, professional_id, customer_name, customer_whatsapp,
                 starts_at, ends_at, status, daily_number, manage_code,
                 created_at, updated_at)
            VALUES (:tenant_id, :professional_id, 'Test', '+573000000001',
                    :starts, :ends, :status, 1, :code, now(), now())
            """
        ),
        {
            "tenant_id": tenant_id, "professional_id": professional_id,
            "starts": starts, "ends": ends, "status": status,
            "code": uuid.uuid4().hex[:10].upper(),
        },
    )


@pytest.fixture()
def pg_fixture(pg_engine):
    """Tenant + barbero efímeros, limpiados al final."""
    with pg_engine.begin() as conn:
        tenant_id = conn.execute(
            text(
                "INSERT INTO tenants (name, slug, created_at, updated_at) "
                "VALUES ('T', :slug, now(), now()) RETURNING id"
            ),
            {"slug": f"test-{uuid.uuid4().hex[:8]}"},
        ).scalar()
        professional_id = conn.execute(
            text(
                "INSERT INTO professional (tenant_id, name, created_at, updated_at) "
                "VALUES (:t, 'B', now(), now()) RETURNING id"
            ),
            {"t": tenant_id},
        ).scalar()
    yield tenant_id, professional_id
    with pg_engine.begin() as conn:
        conn.execute(text("DELETE FROM appointments WHERE tenant_id = :t"), {"t": tenant_id})
        conn.execute(text("DELETE FROM professional WHERE tenant_id = :t"), {"t": tenant_id})
        conn.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})


def test_db_rejects_overlap_even_bypassing_app(pg_engine, pg_fixture):
    from sqlalchemy.exc import IntegrityError

    tenant_id, professional_id = pg_fixture
    base = datetime(2030, 1, 15, 14, 0, tzinfo=timezone.utc)

    with pg_engine.begin() as conn:
        _insert_appointment(conn, tenant_id, professional_id, base, base + timedelta(minutes=45))

    # Solapamiento parcial directo por SQL → el constraint debe rechazarlo
    with pytest.raises(IntegrityError) as excinfo:
        with pg_engine.begin() as conn:
            _insert_appointment(
                conn, tenant_id, professional_id,
                base + timedelta(minutes=30), base + timedelta(minutes=75),
            )
    assert "no_double_booking" in str(excinfo.value)


def test_db_allows_adjacent_and_cancelled(pg_engine, pg_fixture):
    tenant_id, professional_id = pg_fixture
    base = datetime(2030, 2, 10, 9, 0, tzinfo=timezone.utc)

    with pg_engine.begin() as conn:
        _insert_appointment(conn, tenant_id, professional_id, base, base + timedelta(minutes=45))
        # Contiguo (termina exactamente cuando empieza el otro): permitido
        _insert_appointment(
            conn, tenant_id, professional_id,
            base + timedelta(minutes=45), base + timedelta(minutes=90),
        )
        # Solapado pero CANCELADO: permitido (el constraint filtra por estado)
        _insert_appointment(
            conn, tenant_id, professional_id, base, base + timedelta(minutes=45),
            status="cancelado",
        )


def test_db_allows_adjacent_slots(pg_engine, pg_fixture):
    """Turnos pegados (uno arranca cuando el otro termina) no se solapan."""
    tenant_id, professional_id = pg_fixture
    base = datetime(2030, 3, 5, 10, 0, tzinfo=timezone.utc)
    with pg_engine.begin() as conn:
        _insert_appointment(conn, tenant_id, professional_id, base, base + timedelta(minutes=45))
        _insert_appointment(
            conn, tenant_id, professional_id,
            base + timedelta(minutes=45), base + timedelta(minutes=90),
        )
