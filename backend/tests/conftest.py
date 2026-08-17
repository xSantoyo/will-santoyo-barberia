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

_TMP = Path(tempfile.mkdtemp(prefix="willbarbershop-tests-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
        "ENVIRONMENT": "local",
        "JWT_SECRET": "clave-de-pruebas-suficientemente-larga-para-hs256!",
        "STORAGE_BACKEND": "local",
        "LOCAL_MEDIA_ROOT": str(_TMP / "media"),
        "RATE_LIMIT_REQUESTS": "10000",  # sin fricción en tests (hay test dedicado)
        "EMAIL_OUTBOX_DIR": str(_TMP / "outbox"),  # correos de prueba → tmp
        "BOOKING_LEAD_MINUTES": "15",
        # Los tests reparten reservas en semanas distintas para aislarse entre sí:
        "BOOKING_HORIZON_DAYS": "365",
    }
)

import pytest
from fastapi.testclient import TestClient

from app import seed
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Professional, Tenant


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.create_all(engine)
    seed.run()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Los limitadores por IP y el throttle anti fuerza bruta son compartidos:
    se limpian entre tests para que un test no bloquee al siguiente."""
    from sqlalchemy import delete

    from app.deps import RATE_LIMITERS
    from app.models import LoginThrottle

    for limiter in RATE_LIMITERS:
        limiter._hits.clear()
        limiter._last_logged.clear()
    session = SessionLocal()
    try:
        session.execute(delete(LoginThrottle))
        session.commit()
    finally:
        session.close()
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

    return db.scalar(select(Tenant).where(Tenant.slug == seed.TENANT_SLUG))


@pytest.fixture()
def admin_headers(client) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": seed.DEFAULT_ADMIN_USERNAME,
            "password": seed.DEFAULT_ADMIN_PASSWORD,
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def next_working_date(
    professional: Professional, *, offset_days: int = 1, weeks_ahead: int = 0
) -> date:
    """Primera fecha >= mañana en que Will trabaja (evita descansos)."""
    from app.services.availability import weekday_key

    day = date.today() + timedelta(days=offset_days + 7 * weeks_ahead)
    for _ in range(14):
        if (professional.schedule or {}).get(weekday_key(day)):
            return day
        day += timedelta(days=1)
    raise AssertionError("Will no trabaja ningún día (¿seed roto?)")


def next_day_off(professional: Professional) -> date:
    from app.services.availability import weekday_key

    day = date.today() + timedelta(days=1)
    for _ in range(14):
        if not (professional.schedule or {}).get(weekday_key(day)):
            return day
        day += timedelta(days=1)
    raise AssertionError("Will trabaja todos los días (¿seed roto?)")


@pytest.fixture()
def professional(db, tenant) -> Professional:
    from sqlalchemy import select

    return db.scalar(select(Professional).where(Professional.tenant_id == tenant.id))
