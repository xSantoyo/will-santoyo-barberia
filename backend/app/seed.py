"""Datos semilla: Will Santoyo, sus servicios y su cuenta de administración.

Idempotente: se puede ejecutar en cada arranque (docker-compose lo hace); si el
negocio ya existe no duplica nada. Además indexa las fotos reales que Will
coloque en content/will-santoyo/{gallery,profile,cuts}.

Uso: python -m app.seed
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .models import AdminUser, MediaAsset, Professional, Service, Tenant
from .security import hash_password
from .services.storage import KIND_DIRS

logger = logging.getLogger("badboys.seed")

TENANT_SLUG = "will-santoyo"

# Lunes a sábado; domingo de descanso.
SCHEDULE = {
    "mon": {"start": "09:00", "end": "19:00"},
    "tue": {"start": "09:00", "end": "19:00"},
    "wed": {"start": "09:00", "end": "19:00"},
    "thu": {"start": "09:00", "end": "19:00"},
    "fri": {"start": "09:00", "end": "20:00"},
    "sat": {"start": "08:00", "end": "18:00"},
    "sun": None,
}

SERVICES = [
    {"name": "Corte clásico", "price_cop": 30000, "duration_min": 45, "sort_order": 1},
    {"name": "Corte + barba", "price_cop": 45000, "duration_min": 60, "sort_order": 2},
    {"name": "Afeitado tradicional", "price_cop": 25000, "duration_min": 30, "sort_order": 3},
    {"name": "Diseño / line up", "price_cop": 10000, "duration_min": 15, "sort_order": 4},
    {"name": "Corte niño (menor de 10 años)", "price_cop": 25000, "duration_min": 30,
     "sort_order": 5},
    {"name": "Color / mechones", "price_cop": 60000, "duration_min": 90, "sort_order": 6},
]

DEFAULT_ADMIN_USERNAME = "will"
DEFAULT_ADMIN_PASSWORD = "WillSantoyo2026!"  # ⚠️ cambiar en el primer ingreso

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}


def sync_local_media(db: Session, tenant: Tenant) -> int:
    """Registra como MediaAsset las imágenes colocadas a mano en content/
    (solo backend de almacenamiento local). Idempotente por s3_key."""
    settings = get_settings()
    if settings.storage_backend != "local":
        return 0
    root = Path(settings.local_media_root)
    added = 0
    for kind, dirname in KIND_DIRS.items():
        folder = root / tenant.slug / dirname
        if not folder.is_dir():
            continue
        for file in sorted(folder.iterdir()):
            if file.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            key = f"tenants/{tenant.slug}/{dirname}/{file.name}"
            exists = db.scalar(select(MediaAsset.id).where(MediaAsset.s3_key == key))
            if exists:
                continue
            db.add(MediaAsset(tenant_id=tenant.id, kind=kind, s3_key=key, title=file.stem))
            added += 1
    if added:
        db.commit()
        logger.info("Seed: %d imagen(es) de content/ indexadas en la galería.", added)
    return added


def run() -> None:
    db = SessionLocal()
    try:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        if tenant is not None:
            logger.info("Seed: '%s' ya existe, no se duplica nada.", TENANT_SLUG)
            sync_local_media(db, tenant)
            return

        tenant = Tenant(
            name="Will Santoyo",
            slug=TENANT_SLUG,
            whatsapp_number="+573112398873",
            timezone="America/Bogota",
            business_hours=SCHEDULE,
            brand_config={
                "tagline": "Barbero profesional en Soacha",
                "address": "Calle 35 Sur & Cra 15B, Soacha, Cundinamarca",
                "instagram": "https://instagram.com/_barber_wil_",
                "facebook": "https://facebook.com/willsantoyo.0",
                "tiktok": "https://tiktok.com/@willsantoyo",
                "maps_url": "https://maps.google.com/?q=Calle+35+Sur+%26+Cra+15B,+Soacha,+Cundinamarca",
                "colors": {
                    "background": "#0B0B0C",
                    "accent": "#C9A24B",
                    "text": "#F5F1E8",
                    "secondary": "#7A1F2B",
                },
            },
        )
        db.add(tenant)
        db.flush()

        db.add(
            Professional(
                tenant_id=tenant.id,
                name="Will",
                headline="Fades, barba y diseño — a mano, sin afán",
                instagram="@_barber_wil_",
                schedule=SCHEDULE,
            )
        )

        for spec in SERVICES:
            db.add(Service(tenant_id=tenant.id, **spec))

        db.add(
            AdminUser(
                tenant_id=tenant.id,
                username=DEFAULT_ADMIN_USERNAME,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                role="admin",
            )
        )

        db.commit()
        logger.info(
            "Seed completado: %s, %d servicios, usuario '%s' (clave: %s)",
            tenant.name, len(SERVICES), DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD,
        )
        sync_local_media(db, tenant)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
