"""Motor de base de datos y sesión.

Todas las columnas temporales usan TZDateTime: almacenan UTC y devuelven
datetimes conscientes de zona (aware) incluso en SQLite, que de fábrica
descarta la información de zona horaria.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings


class TZDateTime(TypeDecorator):
    """Guarda siempre UTC; devuelve siempre aware-UTC (SQLite y Postgres)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if value.tzinfo is None:
            raise ValueError("Se requieren datetimes conscientes de zona horaria (aware)")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC)


def _is_transaction_pooler(url: str) -> bool:
    """Detecta un pooler en modo transacción delante de Postgres (Supavisor de
    Supabase en el puerto 6543, o pgbouncer explícito). En ese modo cada
    transacción puede caer en una conexión física distinta: el pool de
    SQLAlchemy y los prepared statements de psycopg estorban en vez de ayudar."""
    return "pooler.supabase.com:6543" in url or ":6543/" in url or "pgbouncer=true" in url


def _make_engine():
    settings = get_settings()
    url = settings.database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    elif _is_transaction_pooler(url):
        # Compatibilidad Supabase/pgbouncer (ronda de stack jul-2026):
        # - NullPool: el pooling real lo hace Supavisor, no la aplicación.
        # - prepare_threshold=None: psycopg no emite PREPARE, que en modo
        #   transacción falla con "prepared statement does not exist".
        kwargs["poolclass"] = NullPool
        kwargs["connect_args"] = {"prepare_threshold": None}
        # pgbouncer=true es solo una señal para esta función, no un parámetro
        # que Postgres entienda: se retira antes de conectar.
        url = url.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "")
    return create_engine(url, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
