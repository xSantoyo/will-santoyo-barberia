"""Configuración de la suite.

Los tests unitarios corren contra SQLite (rápido, sin dependencias). Los
marcados @pytest.mark.postgres verifican el constraint de exclusión y corren
solo si TEST_POSTGRES_URL está definida (docker-compose local o CI).

IMPORTANTE: las variables de entorno se fijan ANTES de importar la app,
porque el engine de SQLAlchemy se crea al importar app.db.
"""
from __future__ import annotations

import os
import tempfile
from datetime import date, timedelta
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="badboys-tests-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
        "ENVIRONMENT": "local",
        "JWT_SECRET": "clave-de-pruebas-suficientemente-larga-para-hs256!",
        "STORAGE_BACKEND": "local",
        "LOCAL_MEDIA_ROOT": str(_TMP / "media"),
        "N8N_WEBHOOK_BASE": "",  # webhooks deshabilitados: se auditan como fallidos
        "SERVICE_API_KEY": "test-service-key",
        "RATE_LIMIT_REQUESTS": "10000",  # sin fricción en tests (hay test dedicado)
        "BOOKING_LEAD_MINUTES": "30",
        # Los tests reparten reservas en semanas distintas para aislarse entre sí:
        "BOOKING_HORIZON_DAYS": "365",
    }
)

import pytest
from fastapi.testclient import TestClient

from app import seed
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Barber, Tenant


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.create_all(engine)
    seed.run()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """El limitador de login (5/min) es compartido: se limpia entre tests."""
    from app.deps import booking_rate_limiter
    from app.routers.auth import login_rate_limiter

    booking_rate_limiter._hits.clear()
    login_rate_limiter._hits.clear()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def tenant(db) -> Tenant:
    from sqlalchemy import select

    return db.scalar(select(Tenant).where(Tenant.slug == "bad-boys"))


@pytest.fixture()
def admin_headers(client) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": seed.DEFAULT_ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def barbero_headers(client) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "barbero1", "password": seed.DEFAULT_ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def next_working_date(barber: Barber, *, offset_days: int = 1, weeks_ahead: int = 0) -> date:
    """Primera fecha >= mañana en que el barbero trabaja (evita descansos)."""
    from app.services.availability import weekday_key

    day = date.today() + timedelta(days=offset_days + 7 * weeks_ahead)
    for _ in range(14):
        if (barber.schedule or {}).get(weekday_key(day)):
            return day
        day += timedelta(days=1)
    raise AssertionError("El barbero no trabaja ningún día (¿seed roto?)")


def next_day_off(barber: Barber) -> date:
    from app.services.availability import weekday_key

    day = date.today() + timedelta(days=1)
    for _ in range(14):
        if not (barber.schedule or {}).get(weekday_key(day)):
            return day
        day += timedelta(days=1)
    raise AssertionError("El barbero trabaja todos los días (¿seed roto?)")


@pytest.fixture()
def barbers(db, tenant) -> list[Barber]:
    from sqlalchemy import select

    # Solo los 3 barberos del seed (sort_order 1-3): otros tests crean barberos
    # temporales que no deben interferir.
    return list(
        db.scalars(
            select(Barber)
            .where(Barber.tenant_id == tenant.id, Barber.sort_order.between(1, 3))
            .order_by(Barber.sort_order)
        )
    )
