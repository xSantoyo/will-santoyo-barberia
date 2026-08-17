"""Panel de administración: dashboard, gestión de turnos, servicios, roles."""
from __future__ import annotations

from .conftest import next_working_date

BASE = "/api/v1/admin"


def _services(client):
    return client.get("/api/v1/public/will-barbershop/services").json()


def _manual_booking(client, admin_headers, professional, day, time="09:00", **extra):
    services = _services(client)
    payload = {
        
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
    assert {
        "date_local", "is_day_off", "current", "upcoming", "all_today",
        "done_count", "cancelled_count",
    } <= data.keys()


def test_manual_booking_reschedule_and_history(client, admin_headers, professional, tenant):
    day = next_working_date(professional, weeks_ahead=8)

    created = _manual_booking(client, admin_headers, professional, day, "09:00")
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


def test_status_transitions(client, admin_headers, professional):
    day = next_working_date(professional, weeks_ahead=9)
    appointment = _manual_booking(client, admin_headers, professional, day, "10:00").json()
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


def test_no_show_transition(client, admin_headers, professional):
    day = next_working_date(professional, weeks_ahead=10)
    appointment = _manual_booking(client, admin_headers, professional, day, "11:00",
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
    public = client.get("/api/v1/public/will-barbershop/services").json()
    assert next(s for s in public if s["id"] == barba["id"])["price_cop"] == 48000

    # Desactivar un servicio lo oculta del público pero no del admin
    response = client.patch(
        f"{BASE}/services/{barba['id']}", json={"is_active": False}, headers=admin_headers
    )
    assert response.status_code == 200
    public_ids = {s["id"] for s in client.get("/api/v1/public/will-barbershop/services").json()}
    assert barba["id"] not in public_ids

    # restaurar para no afectar otros tests
    client.patch(f"{BASE}/services/{barba['id']}",
                 json={"is_active": True, "price_cop": 45000}, headers=admin_headers)


