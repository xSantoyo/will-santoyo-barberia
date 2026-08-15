"""Flujo público de agendamiento: disponibilidad → reserva → gestión → cancelación."""
from __future__ import annotations

from .conftest import next_day_off, next_working_date

BASE = "/api/v1/public/will-santoyo"


def _get_slot(client, professional_id: int, day, service_ids: list[int]) -> list[str]:
    response = client.post(
        f"{BASE}/availability",
        json={"professional_id": professional_id, "date": day.isoformat(), "service_ids": service_ids},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_tenant_info(client):
    response = client.get(BASE)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Will Santoyo"
    assert data["timezone"] == "America/Bogota"


def test_full_booking_flow(client, db, professional):
    day = next_working_date(professional)
    services = client.get(f"{BASE}/services").json()
    service_id = services[0]["id"]

    availability = _get_slot(client, professional.id, day, [service_id])
    assert availability["is_day_off"] is False
    assert len(availability["slots"]) > 0
    slot = availability["slots"][0]

    # Reservar
    response = client.post(
        f"{BASE}/appointments",
        json={
            
            "service_ids": [service_id],
            "date": day.isoformat(),
            "time": slot,
            "customer_name": "Juan Pérez",
            "customer_whatsapp": "3001112233",  # se normaliza a +57
        },
    )
    assert response.status_code == 201, response.text
    booked = response.json()
    assert booked["status"] == "confirmado"
    assert booked["daily_number"] >= 1
    assert len(booked["manage_code"]) == 8
    assert booked["total_cop"] == services[0]["price_cop"]

    # El slot desaparece de la disponibilidad
    availability = _get_slot(client, professional.id, day, [service_id])
    assert slot not in availability["slots"]

    # Consultar por enlace único (código)
    code = booked["manage_code"]
    fetched = client.get(f"{BASE}/appointments/{code}").json()
    assert fetched["customer_name"] == "Juan Pérez"

    # Búsqueda por teléfono + código (normalizado a E.164)
    found = client.post(
        f"{BASE}/appointments/find",
        json={"customer_whatsapp": "+573001112233", "manage_code": code.lower()},
    )
    assert found.status_code == 200

    # Teléfono equivocado no encuentra nada
    not_found = client.post(
        f"{BASE}/appointments/find",
        json={"customer_whatsapp": "+573009999999", "manage_code": code},
    )
    assert not_found.status_code == 404

    # Cancelar
    cancelled = client.post(
        f"{BASE}/appointments/{code}/cancel", json={"reason": "No puedo asistir"}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelado"

    # El slot vuelve a estar disponible
    availability = _get_slot(client, professional.id, day, [service_id])
    assert slot in availability["slots"]

    # No se puede cancelar dos veces
    again = client.post(f"{BASE}/appointments/{code}/cancel", json={})
    assert again.status_code == 409


def test_daily_number_increments_per_day(client, professional):
    day = next_working_date(professional, weeks_ahead=1)
    services = client.get(f"{BASE}/services").json()
    service_id = services[3]["id"]  # diseño / line up: 15 min

    availability = _get_slot(client, professional.id, day, [service_id])
    slots = availability["slots"]
    first = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [service_id],
            "date": day.isoformat(), "time": slots[0],
            "customer_name": "Cliente Uno", "customer_whatsapp": "3011111111",
        },
    ).json()
    second = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [service_id],
            "date": day.isoformat(), "time": slots[5],
            "customer_name": "Cliente Dos", "customer_whatsapp": "3022222222",
        },
    ).json()
    assert second["daily_number"] == first["daily_number"] + 1


def test_multiple_services_extend_duration(client, professional):
    """Corte + barba (60') + color (90') = 150 minutos: bloquea 10 slots de 15'."""
    day = next_working_date(professional, weeks_ahead=2)
    services = client.get(f"{BASE}/services").json()
    combo = [services[1]["id"], services[5]["id"]]  # 60 + 90 min

    availability = _get_slot(client, professional.id, day, combo)
    slot = availability["slots"][0]
    response = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": combo,
            "date": day.isoformat(), "time": slot,
            "customer_name": "Cliente Combo", "customer_whatsapp": "3033333333",
        },
    )
    assert response.status_code == 201
    total = response.json()["total_cop"]
    assert total == services[1]["price_cop"] + services[5]["price_cop"]

    # Un servicio de 15 min a mitad del bloque de 150 min debe estar bloqueado
    short = _get_slot(client, professional.id, day, [services[3]["id"]])
    hour, minute = map(int, slot.split(":"))
    inside = f"{hour + 1:02d}:{minute:02d}"  # 60 min después del inicio
    assert inside not in short["slots"]


def test_booking_on_day_off_rejected(client, professional):
    day = next_day_off(professional)
    services = client.get(f"{BASE}/services").json()

    availability = _get_slot(client, professional.id, day, [services[0]["id"]])
    assert availability["is_day_off"] is True
    assert availability["slots"] == []

    response = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "10:00",
            "customer_name": "Cliente Necio", "customer_whatsapp": "3044444444",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "day_off"


def test_booking_outside_schedule_rejected(client, professional):
    day = next_working_date(professional, weeks_ahead=3)
    services = client.get(f"{BASE}/services").json()
    response = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "05:00",  # antes de abrir
            "customer_name": "Madrugador", "customer_whatsapp": "3055555555",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "outside_schedule"


def test_invalid_phone_rejected(client, professional):
    day = next_working_date(professional)
    services = client.get(f"{BASE}/services").json()
    response = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "10:00",
            "customer_name": "Tel Malo", "customer_whatsapp": "abc123",
        },
    )
    assert response.status_code == 422


def test_unknown_tenant_404(client):
    response = client.get("/api/v1/public/no-existe/professional")
    assert response.status_code == 404
