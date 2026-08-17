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
        # Clave del panel fija en los tests. Sin esto la semilla genera una
        # aleatoria por proceso y el 5,9 % de las veces sale sin ningún dígito,
        # que es justo lo que la política de contraseñas rechaza: la suite caía
        # ~1 de cada 17 corridas sin que cambiara una sola línea de código.
        # (Que la semilla pueda generar una clave que la propia app rechaza es
        # un problema de producción aparte, pendiente de decisión.)
        "SEED_ADMIN_PASSWORD": "ClaveDePruebas2026",
        # Los tests reparten reservas en semanas distintas para aislarse entre sí:
        "BOOKING_HORIZON_DAYS": "365",
    }
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app import seed
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Professional, Tenant


@pytest.fixture(scope="session", autouse=True)
def database():
    """Schema y semilla, una sola vez. Lo que escriba cada test se revierte
    después (ver `_transaccion_aislada`), así que esta base queda siempre en el
    estado recién sembrado."""
    _habilitar_savepoints_en_sqlite()
    Base.metadata.create_all(engine)
    seed.run()
    yield
    Base.metadata.drop_all(engine)


def _habilitar_savepoints_en_sqlite() -> None:
    """pysqlite abre transacciones por su cuenta y se come los SAVEPOINT, con lo
    que el rollback por test no revertiría nada. La receta oficial de SQLAlchemy
    es quitarle el control: `isolation_level = None` desactiva su BEGIN
    implícito y aquí lo emitimos nosotros.

    Vive en los tests a propósito: en producción nadie anida transacciones así,
    y `app/db.py` no tiene por qué cargar con andamiaje de pruebas.
    """
    if not engine.url.get_backend_name().startswith("sqlite"):
        return

    @event.listens_for(engine, "connect")
    def _sin_begin_implicito(dbapi_connection, _record):  # pragma: no cover
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin_explicito(conn):  # pragma: no cover
        conn.exec_driver_sql("BEGIN")


@pytest.fixture(autouse=True)
def _transaccion_aislada(database):
    """AISLAMIENTO REAL: cada test corre dentro de una transacción que se
    revierte al terminar, pase o falle.

    El truco está en `SessionLocal.configure(bind=conexión)`: reconfigura el
    sessionmaker *en sitio*, así que los tres sitios que abren sesión
    (`get_db`, `seed.run`, `security.log_event`) quedan atados a la misma
    conexión sin tener que parchear cada módulo por separado.

    `join_transaction_mode="create_savepoint"` hace que el `commit()` de un
    endpoint libere un SAVEPOINT en vez de confirmar la transacción externa:
    el código de producción confirma como siempre y no se entera de nada.

    Antes de esto la base era compartida durante toda la sesión de pytest y los
    tests colisionaban por coincidencia de fechas — `test_growth` y `test_queue`
    reservaban ambos en `hoy + 120`.
    """
    conexion = engine.connect()
    transaccion = conexion.begin()
    SessionLocal.configure(bind=conexion, join_transaction_mode="create_savepoint")
    try:
        yield conexion
    finally:
        SessionLocal.configure(bind=engine, join_transaction_mode="conditional_savepoint")
        transaccion.rollback()
        conexion.close()


@pytest.fixture(autouse=True)
def _outbox_limpio():
    """El correo se escribe en disco, donde el rollback no llega.

    Los nombres de archivo se marcan con la hora al segundo, así que dos tests
    que envíen en el mismo segundo quedan en orden indefinido y el que lee
    `files[-1]` se lleva el correo del otro. Vaciar la carpeta antes de cada
    test le da al outbox el mismo trato que a la base: estado conocido al
    empezar, sin depender de quién corrió antes.
    """
    outbox = _TMP / "outbox"
    if outbox.is_dir():
        for archivo in outbox.iterdir():
            if archivo.is_file():
                archivo.unlink()
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiters(_transaccion_aislada):
    """Los limitadores por IP viven en memoria del proceso, no en la base: el
    rollback no los alcanza y hay que limpiarlos a mano para que un test no
    bloquee al siguiente. (`LoginThrottle` sí es una tabla y ya lo revierte la
    transacción.)"""
    from app.deps import RATE_LIMITERS

    for limiter in RATE_LIMITERS:
        limiter._hits.clear()
        limiter._last_logged.clear()
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
