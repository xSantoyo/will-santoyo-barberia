"""Motor de base de datos y sesión.

Todas las columnas temporales usan TZDateTime: almacenan UTC y devuelven
datetimes conscientes de zona (aware) incluso en SQLite, que de fábrica
descarta la información de zona horaria.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

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
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_engine():
    settings = get_settings()
    kwargs: dict = {"pool_pre_ping": True}
    if settings.database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(settings.database_url, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
