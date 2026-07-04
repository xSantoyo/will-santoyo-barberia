"""Datos semilla: tenant Bad Boys, 3 barberos, servicios, usuarios.

Idempotente: se puede ejecutar en cada arranque (docker-compose lo hace);
si el tenant ya existe no duplica nada.

Uso: python -m app.seed
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from .db import SessionLocal
from .models import AdminUser, Barber, Service, Tenant
from .security import hash_password

logger = logging.getLogger("badboys.seed")

FULL_WEEK = {
    "mon": {"start": "09:00", "end": "19:00"},
    "tue": {"start": "09:00", "end": "19:00"},
    "wed": {"start": "09:00", "end": "19:00"},
    "thu": {"start": "09:00", "end": "19:00"},
    "fri": {"start": "09:00", "end": "20:00"},
    "sat": {"start": "08:00", "end": "18:00"},
    "sun": None,
}

# 3 barberos con horarios y días de descanso DISTINTOS (sección 18 del spec)
BARBERS = [
    {
        "name": "Barbero 1",
        "specialty": "Fades y diseño freestyle",
        "sort_order": 1,
        "schedule": {**FULL_WEEK, "mon": None},  # descansa lunes
    },
    {
        "name": "Barbero 2",
        "specialty": "Barba y afeitado tradicional",
        "sort_order": 2,
        "schedule": {**FULL_WEEK, "tue": None},  # descansa martes
    },
    {
        "name": "Barbero 3",
        "specialty": "Color y estilos clásicos",
        "sort_order": 3,
        "schedule": {
            **FULL_WEEK,
            "wed": None,  # descansa miércoles
            "sat": {"start": "10:00", "end": "20:00"},
        },
    },
]

# Sección 17: solo "Corte clásico" tiene precio confirmado; el resto es ejemplo
# editable desde el panel de administración.
SERVICES = [
    {"name": "Corte clásico", "price_cop": 30000, "duration_min": 45, "sort_order": 1},
    {"name": "Corte + barba", "price_cop": 45000, "duration_min": 60, "sort_order": 2},
    {"name": "Afeitado tradicional", "price_cop": 25000, "duration_min": 30, "sort_order": 3},
    {"name": "Diseño / line up", "price_cop": 10000, "duration_min": 15, "sort_order": 4},
    {"name": "Corte niño (menor de 10 años)", "price_cop": 25000, "duration_min": 30,
     "sort_order": 5},
    {"name": "Color / mechones", "price_cop": 60000, "duration_min": 90, "sort_order": 6},
]

DEFAULT_ADMIN_PASSWORD = "BadBoys2026!"  # ⚠️ cambiar en producción


def run() -> None:
    db = SessionLocal()
    try:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == "bad-boys"))
        if tenant is not None:
            logger.info("Seed: el tenant 'bad-boys' ya existe, no se duplica nada.")
            return

        tenant = Tenant(
            name="Bad Boys Barbershop",
            slug="bad-boys",
            whatsapp_number="+573000000000",  # reemplazar por el número real del negocio
            timezone="America/Bogota",
            business_hours=FULL_WEEK,
            brand_config={
                "tagline": "Elegancia con actitud",
                "address": "Cra. 00 # 00-00, Barrio Ejemplo, Colombia",
                "instagram": "https://instagram.com/badboysbarbershop",
                "facebook": "https://facebook.com/badboysbarbershop",
                "tiktok": "https://tiktok.com/@badboysbarbershop",
                "maps_url": "https://maps.google.com/?q=Bad+Boys+Barbershop",
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

        barbers = []
        for spec in BARBERS:
            barber = Barber(tenant_id=tenant.id, **spec)
            db.add(barber)
            barbers.append(barber)
        db.flush()

        for spec in SERVICES:
            db.add(Service(tenant_id=tenant.id, **spec))

        db.add(
            AdminUser(
                tenant_id=tenant.id,
                username="admin",
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                role="admin",
            )
        )
        # Un login por barbero (rol restringido a su propia agenda)
        for index, barber in enumerate(barbers, start=1):
            db.add(
                AdminUser(
                    tenant_id=tenant.id,
                    username=f"barbero{index}",
                    password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                    role="barbero",
                    barber_id=barber.id,
                )
            )

        db.commit()
        logger.info(
            "Seed completado: tenant bad-boys, %d barberos, %d servicios, "
            "usuarios admin/barbero1-3 (clave: %s)",
            len(BARBERS), len(SERVICES), DEFAULT_ADMIN_PASSWORD,
        )
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
