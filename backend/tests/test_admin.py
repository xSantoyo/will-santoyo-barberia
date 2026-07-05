"""Panel de administración: dashboard, gestión de turnos, servicios, roles."""
from __future__ import annotations

from .conftest import next_working_date

BASE = "/api/v1/admin"


def _services(client):
    return client.get("/api/v1/public/bad-boys/services").json()


def _manual_booking(client, admin_headers, barber, day, time="09:00", **extra):
    services = _services(client)
    payload = {
        "barber_id": barber.id,
        "service_ids": [services[0]["id"]],
        "date": day.isoformat(),
        "time": time,
        "customer_name": "Cliente Telefónico",
        "customer_whatsapp": "3071111111",
        "notes": "Reserva telefónica",
        **extra,
    }
    return client.post(f"{BASE}/appointments", json=payload, headers=admin_headers)


def test_dashboard_structure(client, admin_headers):
    response = client.get(f"{BASE}/dashboard", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "date_local" in data
    assert len(data["barbers"]) == 3
    for block in data["barbers"]:
        assert {"barber", "is_day_off", "current", "upcoming", "all_today"} <= block.keys()


def test_manual_booking_reschedule_and_history(client, admin_headers, barbers, tenant):
    barber = barbers[0]
    day = next_working_date(barber, weeks_ahead=8)

    created = _manual_booking(client, admin_headers, barber, day, "09:00")
    assert created.status_code == 201, created.text
    appointment = created.json()
    assert appointment["notes"] == "Reserva telefónica"

    # Reprogramar al mismo día más tarde
    response = client.patch(
        f"{BASE}/appointments/{appointment['id']}/reschedule",
        json={"date": day.isoformat(), "time": "12:00"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_local"] == "12:00"

    # Reprogramar a otro barbero que trabaje ese día
    other = next(
        b for b in barbers[1:]
        if (b.schedule or {}).get(
            ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day.weekday()]
        )
    )
    response = client.patch(
        f"{BASE}/appointments/{appointment['id']}/reschedule",
        json={"barber_id": other.id, "date": day.isoformat(), "time": "14:00"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["barber_id"] == other.id

    # Cancelar con auditoría
    response = client.post(
        f"{BASE}/appointments/{appointment['id']}/cancel",
        json={"reason": "Cliente pidió cancelar por teléfono"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelado"

    # Aparece en el historial filtrado por estado
    history = client.get(
        f"{BASE}/appointments", params={"status": "cancelado"}, headers=admin_headers
    ).json()
    assert any(a["id"] == appointment["id"] for a in history)

    # Y la acción quedó en el audit log
    audit = client.get(f"{BASE}/audit-log", headers=admin_headers).json()
    actions = {entry["action"] for entry in audit}
    assert "appointment.cancel" in actions
    assert "appointment.create_manual" in actions
    assert "appointment.reschedule" in actions


def test_status_transitions(client, admin_headers, barbers):
    barber = barbers[1]
    day = next_working_date(barber, weeks_ahead=9)
    appointment = _manual_booking(client, admin_headers, barber, day, "10:00").json()
    url = f"{BASE}/appointments/{appointment['id']}/status"

    # confirmado → en_curso → completado
    assert client.patch(url, json={"status": "en_curso"},
                        headers=admin_headers).status_code == 200
    assert client.patch(url, json={"status": "completado"},
                        headers=admin_headers).status_code == 200

    # completado es terminal
    response = client.patch(url, json={"status": "confirmado"}, headers=admin_headers)
    assert response.status_code == 409

    # estado inexistente → validación 422
    assert client.patch(url, json={"status": "inventado"},
                        headers=admin_headers).status_code == 422


def test_no_show_transition(client, admin_headers, barbers):
    barber = barbers[1]
    day = next_working_date(barber, weeks_ahead=10)
    appointment = _manual_booking(client, admin_headers, barber, day, "11:00",
                                  customer_whatsapp="3072222222").json()
    response = client.patch(
        f"{BASE}/appointments/{appointment['id']}/status",
        json={"status": "no_show"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "no_show"


def test_service_price_editable_without_code(client, admin_headers):
    services = client.get(f"{BASE}/services", headers=admin_headers).json()
    barba = next(s for s in services if s["name"] == "Corte + barba")

    response = client.patch(
        f"{BASE}/services/{barba['id']}",
        json={"price_cop": 48000},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["price_cop"] == 48000

    # El cambio se refleja de inmediato en el sitio público
    public = client.get("/api/v1/public/bad-boys/services").json()
    assert next(s for s in public if s["id"] == barba["id"])["price_cop"] == 48000

    # Desactivar un servicio lo oculta del público pero no del admin
    response = client.patch(
        f"{BASE}/services/{barba['id']}", json={"is_active": False}, headers=admin_headers
    )
    assert response.status_code == 200
    public_ids = {s["id"] for s in client.get("/api/v1/public/bad-boys/services").json()}
    assert barba["id"] not in public_ids

    # restaurar para no afectar otros tests
    client.patch(f"{BASE}/services/{barba['id']}",
                 json={"is_active": True, "price_cop": 45000}, headers=admin_headers)


def test_create_and_deactivate_barber(client, admin_headers):
    created = client.post(
        f"{BASE}/barbers",
        json={
            "name": "Barbero Temporal",
            "specialty": "Prueba",
            "instagram": "@temporal.badboys",
            "schedule": {"mon": {"start": "10:00", "end": "18:00"}},
        },
        headers=admin_headers,
    )
    assert created.status_code == 201
    barber_id = created.json()["id"]
    assert created.json()["instagram"] == "@temporal.badboys"

    # El Instagram es editable desde el panel y visible en la tarjeta pública
    updated = client.patch(
        f"{BASE}/barbers/{barber_id}",
        json={"instagram": "@nuevo.handle"},
        headers=admin_headers,
    )
    assert updated.json()["instagram"] == "@nuevo.handle"
    public = client.get("/api/v1/public/bad-boys/barbers").json()
    temporal = next(b for b in public if b["name"] == "Barbero Temporal")
    assert temporal["instagram"] == "@nuevo.handle"

    public_names = {b["name"] for b in public}
    assert "Barbero Temporal" in public_names

    response = client.patch(
        f"{BASE}/barbers/{barber_id}", json={"is_active": False}, headers=admin_headers
    )
    assert response.status_code == 200
    public_names = {b["name"] for b in client.get("/api/v1/public/bad-boys/barbers").json()}
    assert "Barbero Temporal" not in public_names


def test_barbero_sees_only_own_agenda(client, admin_headers, barbero_headers, barbers, db):
    """El rol barbero queda restringido a su propio barber_id en agenda."""
    from datetime import date, timedelta

    start = date.today()
    end = start + timedelta(days=70)  # fuerza validación de rango
    response = client.get(
        f"{BASE}/agenda",
        params={"start": start.isoformat(), "end": end.isoformat()},
        headers=admin_headers,
    )
    assert response.status_code == 400  # rango > 62 días

    end = start + timedelta(days=30)
    admin_view = client.get(
        f"{BASE}/agenda",
        params={"start": start.isoformat(), "end": end.isoformat()},
        headers=admin_headers,
    ).json()
    assert len(admin_view["barbers"]) >= 3

    barbero_view = client.get(
        f"{BASE}/agenda",
        params={"start": start.isoformat(), "end": end.isoformat(),
                "barber_id": barbers[2].id},  # intenta ver la agenda de otro
        headers=barbero_headers,
    ).json()
    # barbero1 está vinculado a barbers[0]: el filtro se fuerza a su propio id
    assert all(b["id"] == barbers[0].id for b in barbero_view["barbers"])
    assert all(a["barber_id"] == barbers[0].id for a in barbero_view["appointments"])
