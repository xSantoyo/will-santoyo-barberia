"""Datos semilla: Will Barber Shop, sus servicios y su cuenta de administración.

Idempotente: se puede ejecutar en cada arranque (docker-compose lo hace); si el
negocio ya existe no duplica nada. Además indexa las fotos reales que Will
coloque en content/will-barbershop/{gallery,profile,cuts}.

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
from .services import passwords
from .services.storage import KIND_DIRS

logger = logging.getLogger("willbarbershop.seed")

TENANT_SLUG = "will-barbershop"

# Lunes a sábado; domingo de descanso.
SCHEDULE = {
    # Jornada 08:00–20:00 en bloques de 1 h. La pausa de almuerzo (13:00–14:00)
    # no se resta aquí: se descuenta de la oferta pública en availability.py,
    # porque Will sí puede agendar ahí a mano desde el panel.
    "mon": {"start": "08:00", "end": "20:00"},
    "tue": {"start": "08:00", "end": "20:00"},
    "wed": {"start": "08:00", "end": "20:00"},
    "thu": {"start": "08:00", "end": "20:00"},
    "fri": {"start": "08:00", "end": "20:00"},
    "sat": {"start": "08:00", "end": "20:00"},
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

DEFAULT_ADMIN_USERNAME = get_settings().seed_admin_username


def _admin_password() -> str:
    """Contraseña inicial del panel.

    NUNCA se escribe en el repositorio: este proyecto es público, y una clave
    en el código es una clave que conoce todo el mundo. Se toma de
    SEED_ADMIN_PASSWORD y, si no está, se genera una aleatoria que se imprime
    UNA sola vez en el log del arranque para que el dueño la copie y la cambie.

    La generación la hace `services.passwords`, que aplica la misma política que
    valida la API. Antes se sorteaba aquí un alfanumérico sin comprobar nada y
    el 5,9 % de las veces salía sin ningún dígito: una clave que el propio panel
    habría rechazado al intentar cambiarla.
    """
    from_env = get_settings().seed_admin_password
    if from_env:
        return from_env
    return passwords.generar()


#: True si la clave la generamos nosotros. Solo entonces tiene sentido
#: escribirla en el log: es la única forma de que el dueño llegue a conocerla.
CLAVE_GENERADA = not get_settings().seed_admin_password


# Se resuelve al importar: los tests la leen de aquí y coincide con la que se
# siembra, porque siembran en este mismo proceso.
DEFAULT_ADMIN_PASSWORD = _admin_password()

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
            name="Will Barber Shop",
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
                    "background": "#F1EEE6",
                    "accent": "#2A4696",
                    "text": "#221D15",
                    "secondary": "#9E3225",
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

        password = DEFAULT_ADMIN_PASSWORD
        db.add(
            AdminUser(
                tenant_id=tenant.id,
                username=DEFAULT_ADMIN_USERNAME,
                password_hash=hash_password(password),
                role="admin",
            )
        )

        db.commit()
        logger.info(
            "Seed completado: %s, %d servicios, usuario '%s'.",
            tenant.name, len(SERVICES), DEFAULT_ADMIN_USERNAME,
        )
        # La clave solo se escribe en el log cuando la generamos aquí: si no,
        # no habría manera de conocerla. Cuando viene de configuración
        # (Secrets Manager, .env) el operador ya la tiene, y volcarla a stdout
        # la deja copiada en CloudWatch para siempre, al alcance de cualquiera
        # con permiso de lectura de logs.
        if CLAVE_GENERADA:
            logger.warning(
                "CONTRASENA INICIAL DEL PANEL: %s  <-- copiala y cambiala al "
                "entrar. No se vuelve a mostrar.", password,
            )
        else:
            logger.info(
                "Clave del panel tomada de la configuracion; no se registra."
            )
        sync_local_media(db, tenant)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
