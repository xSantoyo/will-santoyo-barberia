"""Punto de entrada de la API.

- Local: `uvicorn app.main:app --reload`
- AWS Lambda: `handler` (Mangum) + despachador de tareas administrativas
  (invocar la Lambda con {"badboys_task": "migrate"} ejecuta Alembic).
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

app = FastAPI(
    title="Bad Boys Barbershop API",
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
    from alembic import command
    from alembic.config import Config

    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    command.upgrade(config, "head")
    return {"ok": True, "task": "migrate"}


def handler(event, context):
    """Entrada Lambda: tareas administrativas o proxy HTTP (Mangum)."""
    if isinstance(event, dict) and event.get("badboys_task") == "migrate":
        return _run_migrations()
    from mangum import Mangum

    return Mangum(app)(event, context)
