"""Disponibilidad: descansos puntuales y grilla de slots."""
from __future__ import annotations

from datetime import timedelta

from .conftest import next_working_date

PUBLIC = "/api/v1/public/will-barbershop"
ADMIN = "/api/v1/admin"


def test_time_off_blocks_and_restores(client, admin_headers, professional):
    """Excepción puntual: bloquear un día laborable del barbero."""
    day = next_working_date(professional, weeks_ahead=11)
    services = client.get(f"{PUBLIC}/services").json()

    created = client.post(
        f"{ADMIN}/time-off",
        json={"date": day.isoformat(), "reason": "Cita médica"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    time_off_id = created.json()["id"]

    # Duplicado rechazado
    duplicate = client.post(
        f"{ADMIN}/time-off",
        json={"date": day.isoformat()},
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    # Disponibilidad: día bloqueado
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert availability["is_day_off"] is True

    # Intento de reserva rechazado
    response = client.post(
        f"{PUBLIC}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "10:00",
            "customer_name": "Cliente", "customer_whatsapp": "3081111111",
        },
    )
    assert response.status_code == 409

    # Visible en el endpoint público de excepciones (para el calendario)
    window = client.get(
        f"{PUBLIC}/time-off",
        params={"start": day.isoformat(),
                "end": (day + timedelta(days=1)).isoformat()},
    ).json()
    assert day.isoformat() in window["dates"]

    # Eliminar el descanso restaura la disponibilidad
    deleted = client.delete(f"{ADMIN}/time-off/{time_off_id}", headers=admin_headers)
    assert deleted.status_code == 204
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert availability["is_day_off"] is False
    assert len(availability["slots"]) > 0


def test_slots_respect_schedule(client, professional):
    """Los slots caen dentro de la jornada y en pasos de 15 minutos."""
    day = next_working_date(professional, weeks_ahead=12)
    services = client.get(f"{PUBLIC}/services").json()
    sched = (professional.schedule or {})[
        ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day.weekday()]
    ]
    availability = client.post(
        f"{PUBLIC}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    slots = availability["slots"]
    assert slots, "Debe haber disponibilidad en un día laboral lejano"
    assert slots[0] == sched["start"]
    for slot in slots:
        assert sched["start"] <= slot < sched["end"]
        assert int(slot.split(":")[1]) % 15 == 0


def test_manage_code_returned_prominently(client, professional):
    """ADR-009: sin WhatsApp, el código de gestión que devuelve la API es el
    único canal del cliente para gestionar su turno — debe venir siempre."""
    day = next_working_date(professional, weeks_ahead=13)
    services = client.get(f"{PUBLIC}/services").json()
    booked = client.post(
        f"{PUBLIC}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "09:00",
            "customer_name": "Cliente Código", "customer_whatsapp": "3082222222",
        },
    ).json()
    assert len(booked["manage_code"]) == 8
    # Con ese código (y solo con él) se consulta y cancela sin autenticación
    fetched = client.get(f"{PUBLIC}/appointments/{booked['manage_code']}")
    assert fetched.status_code == 200


def test_public_slots_are_hourly_and_skip_lunch(client, professional):
    """Jornada 08:00–20:00 en bloques de 1 h, sin el almuerzo (13:00–14:00)."""
    day = next_working_date(professional, weeks_ahead=40)
    services = client.get(f"{PUBLIC}/services").json()
    slots = client.post(
        f"{PUBLIC}/availability",
        json={"date": day.isoformat(), "service_ids": [services[0]["id"]]},
    ).json()["slots"]

    # Todos en punto: ninguna media ni cuarto de hora como inicio
    assert all(s.endswith(":00") for s in slots), slots
    assert "13:00" not in slots, "el almuerzo no se ofrece al público"
    assert {"08:00", "12:00", "14:00", "19:00"} <= set(slots)
    # 19:00 es el último: 19:00–20:00 cierra la jornada
    assert "20:00" not in slots


def test_lunch_break_blocked_for_public_but_open_to_admin(
    client, admin_headers, professional
):
    """La pausa no solo se oculta del listado: el backend la rechaza.

    Si solo se filtrara al listar, bastaría con pegar el POST a las 13:00.
    Will sí puede meter un turno ahí desde el panel.
    """
    day = next_working_date(professional, weeks_ahead=41)
    services = client.get(f"{PUBLIC}/services").json()
    payload = {
        "service_ids": [services[0]["id"]],
        "date": day.isoformat(),
        "time": "13:00",
        "customer_name": "Cliente Almuerzo",
        "customer_whatsapp": "3007778899",
    }

    publico = client.post(f"{PUBLIC}/appointments", json=payload)
    assert publico.status_code == 409
    assert publico.json()["detail"]["code"] == "lunch_break"

    # El mismo horario, desde el panel, sí entra
    manual = client.post(f"{ADMIN}/appointments", json=payload, headers=admin_headers)
    assert manual.status_code == 201, manual.text
    assert manual.json()["time_local"] == "13:00"


def test_booking_lead_default_matches_cancel_window():
    """Se puede tomar un hueco hasta 15 min antes, igual que la cancelación.

    Se comprueba el DEFAULT declarado en Settings, no el valor efectivo:
    conftest fija BOOKING_LEAD_MINUTES por entorno para que los tests puedan
    agendar a horas concretas, así que el efectivo aquí no es el de producción.
    Lo que importa es que el default del despliegue real sea 15 y coincida con
    la ventana de cancelación — son la misma promesa al cliente.
    """
    from app.config import Settings

    assert Settings.model_fields["booking_lead_minutes"].default == 15
    assert Settings.model_fields["cancel_window_minutes"].default == 15
