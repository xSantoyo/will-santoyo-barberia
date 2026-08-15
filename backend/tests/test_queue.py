"""La Fila en vivo: tablero público de turnos del día y posición por código.

Se congela `utcnow` del router público en un día lejano (sin interferencia de
otros tests) y se insertan turnos directamente con estados controlados.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.db import SessionLocal
from app.models import Appointment
from app.routers import public as public_router

BASE = "/api/v1/public/will-santoyo"
TZ = ZoneInfo("America/Bogota")

# Día aislado: ningún otro test reserva a +120 días
FROZEN_LOCAL = (datetime.now(TZ) + timedelta(days=120)).replace(
    hour=15, minute=0, second=0, microsecond=0
)


@pytest.fixture()
def frozen_now(monkeypatch):
    monkeypatch.setattr(public_router, "utcnow", lambda: FROZEN_LOCAL)
    return FROZEN_LOCAL


def _make(db, tenant, professional, *, number, start_local, minutes=30, status="confirmado"):
    appointment = Appointment(
        tenant_id=tenant.id,
        professional_id=professional.id,
        customer_name=f"Cliente Fila {number}",
        customer_whatsapp="+573009990000",
        starts_at=start_local,
        ends_at=start_local + timedelta(minutes=minutes),
        status=status,
        daily_number=number,
        manage_code=uuid.uuid4().hex[:8].upper(),
    )
    db.add(appointment)
    return appointment


@pytest.fixture()
def queue_day(tenant, professional, frozen_now):
    """Una jornada realista: #1 atendido, #2 en el sillón, #3 y #4 esperan,
    #5 canceló."""
    db = SessionLocal()
    day = frozen_now
    rows = {
        1: _make(db, tenant, professional, number=1,
                 start_local=day.replace(hour=13), status="completado"),
        2: _make(db, tenant, professional, number=2,
                 start_local=day - timedelta(minutes=15), status="en_curso"),
        3: _make(db, tenant, professional, number=3,
                 start_local=day + timedelta(minutes=30)),
        4: _make(db, tenant, professional, number=4,
                 start_local=day + timedelta(minutes=60)),
        5: _make(db, tenant, professional, number=5,
                 start_local=day + timedelta(minutes=90), status="cancelado"),
    }
    db.commit()
    codes = {n: r.manage_code for n, r in rows.items()}
    yield professional, codes
    for row in rows.values():
        db.delete(row)
    db.commit()
    db.close()


def test_public_board_shows_the_line(client, queue_day):
    board = client.get(f"{BASE}/queue")
    assert board.status_code == 200
    data = board.json()

    assert data["current"]["number"] == 2          # en el sillón
    assert [w["number"] for w in data["waiting"]] == [3, 4]  # cancelado #5 fuera
    assert data["served_count"] == 1
    assert data["last_served_number"] == 1
    # El tablero de HOY refleja el día congelado
    assert data["date_local"] == FROZEN_LOCAL.date().isoformat()


def test_board_leaks_no_personal_data(client, queue_day):
    raw = client.get(f"{BASE}/queue").text
    assert "Cliente Fila" not in raw
    assert "+5730099" not in raw


def test_ticket_queue_position(client, queue_day):
    _, codes = queue_day
    # El #4 tiene delante al #2 (en curso) y al #3 (espera): faltan 2
    position = client.get(f"{BASE}/appointments/{codes[4]}/queue").json()
    assert position["is_today"] is True
    assert position["number"] == 4
    assert position["ahead_count"] == 2
    assert position["now_serving"] == 2

    # El #3 solo tiene delante al #2
    position = client.get(f"{BASE}/appointments/{codes[3]}/queue").json()
    assert position["ahead_count"] == 1

    # Un turno ya completado no reporta fila
    position = client.get(f"{BASE}/appointments/{codes[1]}/queue").json()
    assert position["ahead_count"] == 0
    assert position["status"] == "completado"

    # Código inexistente → 404
    assert client.get(f"{BASE}/appointments/NOEXISTE/queue").status_code == 404
