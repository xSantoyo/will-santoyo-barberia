"""Fila de demostración para las capturas de verificación visual.

Crea (idempotente-ish: usa teléfonos fijos de demo) turnos de HOY para que el
tablero /hoy, el tiquete vivo, el portal y el panel admin tengan contenido
real, y enciende anticipos + tienda de regalos para las capturas de pagos.

Uso (con el backend apuntando al MISMO dev.db):
    cd backend
    .\\.venv\\Scripts\\python.exe ..\\scratchpad\\demo_queue.py

Escribe frontend/e2e/.demo-queue.json con los códigos que usa
screenshots.capture.spec.ts.
"""
from __future__ import annotations

import json
import sys
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

from sqlalchemy import select  # noqa: E402

from app import seed  # noqa: E402
from app.db import SessionLocal, utcnow  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentService,
    Barber,
    Review,
    Service,
    Tenant,
)
from app.services.appointments import generate_manage_code  # noqa: E402

DEMO_PHONE = "+573190000001"   # cliente del portal (varias visitas)
DEMO_PHONE_2 = "+573190000002"


def add_appointment(db, tenant, barber, services, *, starts_at, status,
                    name, phone, number, created_at=None, confirmed=None):
    appointment = Appointment(
        tenant_id=tenant.id,
        barber_id=barber.id,
        customer_name=name,
        customer_whatsapp=phone,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(minutes=sum(s.duration_min for s in services)),
        status=status,
        daily_number=number,
        manage_code=generate_manage_code(db),
        attendance_confirmed_at=confirmed,
    )
    for service in services:
        appointment.services.append(
            AppointmentService(service_id=service.id, name=service.name,
                               price_cop=service.price_cop,
                               duration_min=service.duration_min)
        )
    db.add(appointment)
    db.flush()
    if created_at is not None:
        appointment.created_at = created_at
    return appointment


def main() -> None:
    seed.run()
    db = SessionLocal()
    tenant = db.scalar(select(Tenant).where(Tenant.slug == "bad-boys"))
    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    barbers = list(
        db.scalars(
            select(Barber).where(Barber.tenant_id == tenant.id,
                                 Barber.sort_order.between(1, 3))
            .order_by(Barber.sort_order)
        )
    )
    services = list(
        db.scalars(select(Service).where(Service.tenant_id == tenant.id)
                   .order_by(Service.sort_order))
    )
    corte, corte_barba = services[0], services[1]

    # Pagos ON para las capturas del flujo de anticipo y regalos
    tenant.brand_config = {
        **(tenant.brand_config or {}),
        "deposits_enabled": True,
        "deposit_cop": 10000,
        "gift_shop_enabled": True,
    }

    # Limpia la demo anterior (mismos teléfonos) para poder re-ejecutar
    for phone in (DEMO_PHONE, DEMO_PHONE_2):
        for old in db.scalars(select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.customer_whatsapp == phone)):
            if old.review:
                db.delete(old.review)
            db.delete(old)
    db.flush()

    codes: dict[str, str] = {"portal_phone": DEMO_PHONE.removeprefix("+57")}
    names = ["Carlos M.", "Andrés P.", "Julián R.", "Sebastián T.", "Mateo V."]

    for index, barber in enumerate(barbers):
        base = now - timedelta(hours=3)
        # dos atendidos esta mañana
        for j in range(2):
            appointment = add_appointment(
                db, tenant, barber, [corte],
                starts_at=base + timedelta(minutes=50 * j),
                status="completado", name=names[(index + j) % len(names)],
                phone=DEMO_PHONE if (index == 0 and j == 0) else DEMO_PHONE_2,
                number=j + 1,
            )
            if index == 0 and j == 1:
                codes["review_code"] = appointment.manage_code  # completado sin reseña
        # uno en el sillón AHORA
        current = add_appointment(
            db, tenant, barber, [corte_barba],
            starts_at=now - timedelta(minutes=15),
            status="en_curso", name=names[(index + 2) % len(names)],
            phone=DEMO_PHONE_2, number=3,
        )
        # dos esperando
        for j in range(2):
            appointment = add_appointment(
                db, tenant, barber, [corte],
                starts_at=current.ends_at + timedelta(minutes=45 * j + 10),
                status="confirmado", name=names[(index + 3 + j) % len(names)],
                phone=DEMO_PHONE if (index == 0 and j == 0) else DEMO_PHONE_2,
                number=4 + j,
            )
            if index == 0 and j == 0:
                codes["ticket_code"] = appointment.manage_code
                codes["portal_code"] = appointment.manage_code

    # Turno con confirmación de asistencia PENDIENTE: empieza en 5 h, reservado
    # hace más de 24 h (ventana abierta, deadline en 2 h)
    pending = add_appointment(
        db, tenant, barbers[1], [corte],
        starts_at=now + timedelta(hours=5),
        status="confirmado", name="Cliente Previsor", phone=DEMO_PHONE,
        number=9, created_at=now - timedelta(hours=30),
    )
    codes["confirm_code"] = pending.manage_code

    # Una reseña previa para que la sección del home tenga contenido
    reviewed = add_appointment(
        db, tenant, barbers[2], [corte],
        starts_at=now - timedelta(days=2), status="completado",
        name="Cliente Feliz", phone=DEMO_PHONE, number=1,
        created_at=now - timedelta(days=2, hours=2),
    )
    if reviewed.review is None:
        db.add(Review(
            tenant_id=tenant.id, appointment_id=reviewed.id,
            barber_id=barbers[2].id, customer_whatsapp=DEMO_PHONE,
            customer_name="Cliente Feliz", rating=5,
            comment="El mejor fade de la ciudad. La fila en vivo es un golazo.",
        ))

    db.commit()

    out = REPO / "frontend" / "e2e" / ".demo-queue.json"
    out.write_text(json.dumps(codes, indent=2), encoding="utf-8")
    local = now.astimezone(tz).strftime("%H:%M")
    print(f"Demo lista ({local} local). Códigos → {out}")
    print(json.dumps(codes, indent=2))
    db.close()


if __name__ == "__main__":
    main()
