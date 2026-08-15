"""Prevención de doble-reserva (capa de aplicación).

La capa de base de datos (constraint de exclusión) se verifica en
test_postgres_constraint.py contra PostgreSQL real.
"""
from __future__ import annotations

from .conftest import next_working_date

BASE = "/api/v1/public/will-santoyo"


def _services(client):
    return client.get(f"{BASE}/services").json()


def _book(client, professional_id, day, time, name="Cliente", phone="3061111111",
          service_ids=None, services=None):
    return client.post(
        f"{BASE}/appointments",
        json={
            "professional_id": professional_id,
            "service_ids": service_ids or [services[0]["id"]],
            "date": day.isoformat(),
            "time": time,
            "customer_name": name,
            "customer_whatsapp": phone,
        },
    )


def test_exact_same_slot_rejected(client, professional):
    day = next_working_date(professional, weeks_ahead=4)
    services = _services(client)

    first = _book(client, professional.id, day, "10:00", services=services)
    assert first.status_code == 201
    second = _book(client, professional.id, day, "10:00", name="Otro Cliente",
                   phone="3062222222", services=services)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "overlap"


def test_partial_overlap_rejected(client, professional):
    """Corte clásico dura 45': una reserva a las 11:00 bloquea 11:15 y 11:30,
    y también una reserva larga que la envuelva."""
    day = next_working_date(professional, weeks_ahead=5)
    services = _services(client)

    assert _book(client, professional.id, day, "11:00", services=services).status_code == 201

    for time in ("11:15", "11:30"):
        response = _book(client, professional.id, day, time, phone="3063333333",
                         services=services)
        assert response.status_code == 409, f"El slot {time} debió rechazarse"

    # Reserva de 150 min empezando antes (10:30 + 150' = 13:00) envuelve a la de 11:00
    long_combo = [services[1]["id"], services[5]["id"]]
    response = _book(client, professional.id, day, "10:30", phone="3064444444",
                     service_ids=long_combo, services=services)
    assert response.status_code == 409

    # A las 11:45 la primera reserva (11:00–11:45) ya terminó: debe aceptarse
    response = _book(client, professional.id, day, "11:45", phone="3065555555",
                     services=services)
    assert response.status_code == 201


def test_cancelled_slot_reusable(client, professional):
    day = next_working_date(professional, weeks_ahead=7)
    services = _services(client)

    first = _book(client, professional.id, day, "16:00", services=services)
    assert first.status_code == 201
    code = first.json()["manage_code"]

    blocked = _book(client, professional.id, day, "16:00", phone="3067777777",
                    services=services)
    assert blocked.status_code == 409

    client.post(f"{BASE}/appointments/{code}/cancel", json={})

    retry = _book(client, professional.id, day, "16:00", phone="3067777777",
                  services=services)
    assert retry.status_code == 201
