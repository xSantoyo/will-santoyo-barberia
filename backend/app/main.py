"""Punto de entrada de la API.

- Local: `uvicorn app.main:app --reload`
- AWS Lambda: `handler` (Mangum) + despachador de tareas administrativas
  (invocar la Lambda con {"app_task": "migrate"} ejecuta Alembic).
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routers import admin, auth, public

logging.basicConfig(level=logging.INFO)

settings = get_settings()


def _enforce_production_secrets() -> None:
    """Corta el arranque si un despliegue real sale con secretos de fábrica.
    Es mejor que la API no levante a que levante firmando JWT con un secreto
    público del repositorio."""
    if settings.environment == "local":
        return
    if settings.jwt_secret == "change-me-in-production" or len(settings.jwt_secret) < 32:
        raise RuntimeError(
            "JWT_SECRET inválido para un entorno no-local: configura un secreto "
            "aleatorio de al menos 32 caracteres (Secrets Manager en AWS)."
        )
    if settings.wompi_mode == "production" and not (
        settings.wompi_public_key
        and settings.wompi_integrity_secret
        and settings.wompi_events_secret
    ):
        raise RuntimeError(
            "wompi_mode=production requiere WOMPI_PUBLIC_KEY, "
            "WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET configurados."
        )


_enforce_production_secrets()

app = FastAPI(
    title="Will Barber Shop — API",
    version="1.0.0",
    description="Plataforma de gestión y reservas para barberías (multi-tenant).",
    docs_url="/docs" if settings.environment != "prod" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Cabeceras defensivas en todas las respuestas de la API."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")  # la API nunca va en iframe
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if settings.environment == "prod":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response

app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}


# En modo local el backend sirve las imágenes (en prod lo hace CloudFront).
if settings.storage_backend == "local":
    media_root = Path(settings.local_media_root)
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media_root)), name="media")


# ---------------------------------------------------------------- AWS Lambda

def _run_migrations() -> dict:
    from alembic.config import Config

    from alembic import command

    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    command.upgrade(config, "head")
    return {"ok": True, "task": "migrate"}


def handler(event, context):
    """Entrada Lambda: tareas administrativas o proxy HTTP (Mangum)."""
    if isinstance(event, dict) and event.get("app_task") == "migrate":
        return _run_migrations()
    from mangum import Mangum

    return Mangum(app)(event, context)
