"""Disponibilidad: descansos puntuales y grilla de slots."""
from __future__ import annotations

from datetime import timedelta

from .conftest import next_working_date

PUBLIC = "/api/v1/public/bad-boys"
ADMIN = "/api/v1/admin"


def test_time_off_blocks_and_restores(client, admin_headers, barbers):
    """Excepción puntual: bloquear un día laborable del barbero."""
    barber = barbers[0]
    day = next_working_date(barber, weeks_ahead=11)
    services = client.get(f"{PUBLIC}/services").json()

    created = client.post(
        f"{ADMIN}/barbers/{barber.id}/time-off",
        json={"date": day.isoformat(), "reason": "Cita médica"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    time_off_id = created.json()["id"]

    # Duplicado rechazado
    duplicate = client.post(
        f"{ADMIN}/barbers/{barber.id}/time-off",
        json={"date": day.isoformat()},
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    # Disponibilidad: día bloqueado
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"barber_id": barber.id, "date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert availability["is_day_off"] is True

    # Intento de reserva rechazado
    response = client.post(
        f"{PUBLIC}/appointments",
        json={
            "barber_id": barber.id, "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "10:00",
            "customer_name": "Cliente", "customer_whatsapp": "3081111111",
        },
    )
    assert response.status_code == 409

    # Visible en el endpoint público de excepciones (para el calendario)
    window = client.get(
        f"{PUBLIC}/barbers/{barber.id}/time-off",
        params={"start": day.isoformat(),
                "end": (day + timedelta(days=1)).isoformat()},
    ).json()
    assert day.isoformat() in window["dates"]

    # Eliminar el descanso restaura la disponibilidad
    deleted = client.delete(f"{ADMIN}/time-off/{time_off_id}", headers=admin_headers)
    assert deleted.status_code == 204
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"barber_id": barber.id, "date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert availability["is_day_off"] is False
    assert len(availability["slots"]) > 0


def test_slots_respect_barber_schedule(client, barbers):
    """Los slots caen dentro de la jornada y en pasos de 15 minutos."""
    barber = barbers[0]
    day = next_working_date(barber, weeks_ahead=12)
    services = client.get(f"{PUBLIC}/services").json()
    sched = (barber.schedule or {})[
        ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day.weekday()]
    ]
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"barber_id": barber.id, "date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    slots = availability["slots"]
    assert slots, "Debe haber disponibilidad en un día laboral lejano"
    assert slots[0] == sched["start"]
    for slot in slots:
        assert sched["start"] <= slot < sched["end"]
        assert int(slot.split(":")[1]) % 15 == 0


def test_manage_code_returned_prominently(client, barbers):
    """ADR-009: sin WhatsApp, el código de gestión que devuelve la API es el
    único canal del cliente para gestionar su turno — debe venir siempre."""
    barber = barbers[2]
    day = next_working_date(barber, weeks_ahead=13)
    services = client.get(f"{PUBLIC}/services").json()
    booked = client.post(
        f"{PUBLIC}/appointments",
        json={
            "barber_id": barber.id, "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "09:00",
            "customer_name": "Cliente Código", "customer_whatsapp": "3082222222",
        },
    ).json()
    assert len(booked["manage_code"]) == 6
    # Con ese código (y solo con él) se consulta y cancela sin autenticación
    fetched = client.get(f"{PUBLIC}/appointments/{booked['manage_code']}")
    assert fetched.status_code == 200
