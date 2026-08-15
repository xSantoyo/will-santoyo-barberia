"""Tanda 2: walk-ins (próximo hueco de hoy) y confirmación de asistencia
con liberación automática del turno.

`utcnow` se congela en un martes lejano a las 15:00 (Bogotá): Barbero 1
trabaja (descansa lunes) y Barbero 2 descansa (martes).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.db import SessionLocal
from app.models import Appointment
from app.services import appointments as appointments_service
from app.services import availability as availability_service

TZ = ZoneInfo("America/Bogota")
BASE_PUBLIC = "/api/v1/public/will-santoyo"
BASE_ADMIN = "/api/v1/admin"


def _far_weekday(weekday: int) -> datetime:
    day = (datetime.now(TZ) + timedelta(days=130)).replace(
        hour=15, minute=0, second=0, microsecond=0
    )
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day


FROZEN = _far_weekday(1)        # martes: Will trabaja
FROZEN_DAY_OFF = _far_weekday(6)  # domingo: descansa


@pytest.fixture()
def frozen_now(monkeypatch):
    for module in (appointments_service, availability_service):
        monkeypatch.setattr(module, "utcnow", lambda: FROZEN)
    return FROZEN


@pytest.fixture()
def frozen_day_off(monkeypatch):
    for module in (appointments_service, availability_service):
        monkeypatch.setattr(module, "utcnow", lambda: FROZEN_DAY_OFF)
    return FROZEN_DAY_OFF


# ------------------------------------------------------------------ walk-ins

def test_walk_in_takes_next_slot_today(client, admin_headers, professional, frozen_now):
    services = client.get(f"{BASE_PUBLIC}/services").json()
    corte = services[0]  # el turno dura 1 h

    first = client.post(
        f"{BASE_ADMIN}/appointments/walk-in",
        json={
            
            "service_ids": [corte["id"]],
            "customer_name": "Walkin Uno",
            "customer_whatsapp": None,  # no dejó teléfono
        },
        headers=admin_headers,
    )
    assert first.status_code == 201, first.text
    data = first.json()
    assert data["time_local"] == "15:00"  # ahora mismo: 15:00 estaba libre
    assert data["date_local"] == FROZEN.date().isoformat()
    assert data["customer_whatsapp"] is None
    assert data["notes"] == "Walk-in"
    assert len(data["manage_code"]) == 8  # entra a La Fila con tiquete propio

    # El segundo walk-in cae después del primero (bloque de 1 h → 16:00)
    second = client.post(
        f"{BASE_ADMIN}/appointments/walk-in",
        json={
            
            "service_ids": [corte["id"]],
            "customer_name": "Walkin Dos",
            "customer_whatsapp": "3001234567",
        },
        headers=admin_headers,
    )
    assert second.status_code == 201
    assert second.json()["time_local"] == "16:00"
    assert second.json()["daily_number"] == data["daily_number"] + 1


def test_walk_in_rejected_on_day_off(client, admin_headers, professional, frozen_day_off):
    services = client.get(f"{BASE_PUBLIC}/services").json()
    response = client.post(
        f"{BASE_ADMIN}/appointments/walk-in",
        json={
            # domingo: Will descansa
            "service_ids": [services[0]["id"]],
            "customer_name": "Walkin Fallido",
        },
        headers=admin_headers,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "day_off"


def _make_appointment(db, tenant, professional, *, starts, created, confirmed_at=None,
                      status="confirmado"):
    appointment = Appointment(
        tenant_id=tenant.id,
        professional_id=professional.id,
        customer_name="Cliente Asistencia",
        customer_whatsapp="+573007770000",
        starts_at=starts,
        ends_at=starts + timedelta(minutes=30),
        status=status,
        daily_number=99,
        manage_code=uuid.uuid4().hex[:8].upper(),
        created_at=created,
        attendance_confirmed_at=confirmed_at,
    )
    db.add(appointment)
    db.commit()
    return appointment.manage_code, appointment.id


def test_confirm_attendance_flow(client, tenant, professional, frozen_now):
    db = SessionLocal()
    # Reservó hace 30h para dentro de 5h: la ventana está abierta (límite -3h)
    code, _ = _make_appointment(
        db, tenant, professional,
        starts=FROZEN + timedelta(hours=5), created=FROZEN - timedelta(hours=30),
    )

    ticket = client.get(f"{BASE_PUBLIC}/appointments/{code}").json()
    assert ticket["attendance_pending"] is True
    assert ticket["attendance_deadline_local"] == (
        (FROZEN + timedelta(hours=2)).astimezone(TZ).strftime("%H:%M")
    )

    confirmed = client.post(f"{BASE_PUBLIC}/appointments/{code}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["attendance_confirmed"] is True
    assert confirmed.json()["attendance_pending"] is False

    # Idempotente
    assert client.post(f"{BASE_PUBLIC}/appointments/{code}/confirm").status_code == 200
    db.close()


def test_confirm_too_early_and_not_required(client, tenant, professional, frozen_now):
    db = SessionLocal()
    # Turno en 30h: la ventana abre en 6h → aún no
    early_code, _ = _make_appointment(
        db, tenant, professional,
        starts=FROZEN + timedelta(hours=30), created=FROZEN - timedelta(hours=1),
    )
    response = client.post(f"{BASE_PUBLIC}/appointments/{early_code}/confirm")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "too_early"

    # Reserva de último minuto (creada hace 1h para dentro de 2h): no aplica
    lastminute_code, _ = _make_appointment(
        db, tenant, professional,
        starts=FROZEN + timedelta(hours=2), created=FROZEN - timedelta(hours=1),
    )
    ticket = client.get(f"{BASE_PUBLIC}/appointments/{lastminute_code}").json()
    assert ticket["attendance_pending"] is False
    response = client.post(f"{BASE_PUBLIC}/appointments/{lastminute_code}/confirm")
    assert response.json()["detail"]["code"] == "not_required"
    db.close()


def test_unconfirmed_slot_is_released_automatically(client, tenant, professional, frozen_now):
    db = SessionLocal()
    # Venció su ventana (empieza en 2h, límite era hace... -3h → ya pasó) y NO confirmó
    released_code, released_id = _make_appointment(
        db, tenant, professional,
        starts=FROZEN + timedelta(hours=2), created=FROZEN - timedelta(hours=40),
    )
    # Su gemelo SÍ confirmó: debe sobrevivir
    kept_code, _ = _make_appointment(
        db, tenant, professional,
        starts=FROZEN + timedelta(hours=2, minutes=30),
        created=FROZEN - timedelta(hours=40),
        confirmed_at=FROZEN - timedelta(hours=6),
    )

    # Cualquier lectura pública dispara la liberación perezosa
    services = client.get(f"{BASE_PUBLIC}/services").json()
    client.post(
        f"{BASE_PUBLIC}/availability",
        json={
            
            "date": (FROZEN + timedelta(hours=2)).astimezone(TZ).date().isoformat(),
            "service_ids": [services[0]["id"]],
        },
    )

    released = client.get(f"{BASE_PUBLIC}/appointments/{released_code}").json()
    kept = client.get(f"{BASE_PUBLIC}/appointments/{kept_code}").json()
    assert released["status"] == "cancelado"
    assert kept["status"] == "confirmado"

    row = db.get(Appointment, released_id)
    db.refresh(row)
    assert "no confirmó asistencia" in row.cancel_reason
    db.close()
