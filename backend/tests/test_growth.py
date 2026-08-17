"""Tanda 4: regalos, referidos, reserva grupal, repetir turno, productos,
portafolio del barbero."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import Appointment

from .conftest import next_working_date

BASE = "/api/v1/public/will-barbershop"
ADMIN = "/api/v1/admin"


def _services(client):
    return client.get(f"{BASE}/services").json()


def test_gift_code_lifecycle(client, admin_headers, professional):
    """Crear → reservar con él (hold) → cancelar libera → reservar → completar consume."""
    created = client.post(
        f"{ADMIN}/gift-codes",
        json={"description": "Corte clásico de regalo (pagado en el local)"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    gift = created.json()
    assert gift["code"].startswith("G-")

    day = next_working_date(professional, weeks_ahead=15)
    services = _services(client)

    def book(time, gift_code=None, phone="3161110001"):
        return client.post(
            f"{BASE}/appointments",
            json={
                "service_ids": [services[0]["id"]],
                "date": day.isoformat(), "time": time,
                "customer_name": "Cliente Regalo", "customer_whatsapp": phone,
                "gift_code": gift_code,
            },
        )

    # Código inexistente → 404
    assert book("09:00", gift_code="G-NOEXIS").status_code == 404

    first = book("09:00", gift_code=gift["code"])
    assert first.status_code == 201
    assert "regalo" in first.json()["gift_description"].lower()

    # Mientras está reservado, nadie más puede usarlo
    assert book("10:00", gift_code=gift["code"], phone="3161110002").status_code == 409

    # Cancelar libera el regalo
    client.post(f"{BASE}/appointments/{first.json()['manage_code']}/cancel", json={})
    second = book("10:00", gift_code=gift["code"], phone="3161110002")
    assert second.status_code == 201

    # Completar la cita lo consume definitivamente
    db = SessionLocal()
    from sqlalchemy import select

    appointment = db.scalar(
        select(Appointment).where(Appointment.manage_code == second.json()["manage_code"])
    )
    for status in ("en_curso", "completado"):
        client.patch(
            f"{ADMIN}/appointments/{appointment.id}/status",
            json={"status": status}, headers=admin_headers,
        )
    listing = client.get(f"{ADMIN}/gift-codes", headers=admin_headers).json()
    row = next(g for g in listing if g["code"] == gift["code"])
    assert row["redeemed_at"] is not None
    db.close()


def test_referral_code_flow(client, tenant, professional):
    """El portal emite el código; un amigo reserva con él; al completar, suma
    una tijera extra en la fidelidad del que refirió."""
    db = SessionLocal()
    referrer_phone = "+573162220001"
    start = datetime.now(timezone.utc) - timedelta(days=3)
    anchor = Appointment(
        tenant_id=tenant.id, professional_id=professional.id, customer_name="Referidor Uno",
        customer_whatsapp=referrer_phone, starts_at=start,
        ends_at=start + timedelta(minutes=45), status="completado",
        daily_number=1, manage_code=uuid.uuid4().hex[:8].upper(),
    )
    db.add(anchor)
    db.commit()

    portal = client.post(
        f"{BASE}/portal",
        json={"customer_whatsapp": referrer_phone, "manage_code": anchor.manage_code},
    ).json()
    my_code = portal["referral_code"]
    assert my_code.startswith("BB-")
    assert portal["loyalty"]["referral_bonus"] == 0

    # No puedes usar tu propio código
    day = next_working_date(professional, weeks_ahead=16)
    services = _services(client)
    own = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "11:00",
            "customer_name": "Referidor Uno", "customer_whatsapp": referrer_phone,
            "referral_code": my_code,
        },
    )
    assert own.status_code == 409

    # El amigo reserva con el código y completa su corte
    friend = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "12:00",
            "customer_name": "Amigo Nuevo", "customer_whatsapp": "3162220002",
            "referral_code": my_code,
        },
    )
    assert friend.status_code == 201

    from sqlalchemy import select

    friend_row = db.scalar(
        select(Appointment).where(Appointment.manage_code == friend.json()["manage_code"])
    )
    friend_row.status = "completado"
    db.commit()

    portal = client.post(
        f"{BASE}/portal",
        json={"customer_whatsapp": referrer_phone, "manage_code": anchor.manage_code},
    ).json()
    assert portal["loyalty"]["referral_bonus"] == 1
    assert portal["loyalty"]["progress"] == 2  # 1 corte propio + 1 tijera de referido
    db.close()


def test_group_booking_back_to_back(client, professional):
    """Padre e hijo: dos turnos seguidos, todo o nada."""
    day = next_working_date(professional, weeks_ahead=17)
    services = _services(client)
    corte = services[0]  # el turno dura 1 h

    group = client.post(
        f"{BASE}/appointments/group",
        json={
            "date": day.isoformat(), "time": "09:00",
            "customer_whatsapp": "3163330001",
            "customers": [
                {"name": "Padre Grupo", "service_ids": [corte["id"]]},
                {"name": "Hijo Grupo", "service_ids": [services[4]["id"]]},  # niño 30'
            ],
        },
    )
    assert group.status_code == 201, group.text
    created = group.json()["appointments"]
    # Bloques de 1 h: el segundo arranca justo cuando termina el primero
    assert [a["time_local"] for a in created] == ["09:00", "10:00"]
    assert created[1]["daily_number"] == created[0]["daily_number"] + 1

    # Un grupo grande en tramos libres (15:00, 16:00, 17:00) sí entra completo.
    # Se elige la tarde a propósito: 11–13 cruzaría la pausa de almuerzo
    # (13:00–14:00), que el público no puede reservar.
    trio = client.post(
        f"{BASE}/appointments/group",
        json={
            "date": day.isoformat(), "time": "15:00",
            "customer_whatsapp": "3163330002",
            "customers": [
                {"name": "Parche Uno", "service_ids": [corte["id"]]},
                {"name": "Parche Dos", "service_ids": [corte["id"]]},
                {"name": "Parche Tres", "service_ids": [corte["id"]]},
            ],
        },
    )
    assert trio.status_code == 201
    assert [a["time_local"] for a in trio.json()["appointments"]] == [
        "15:00", "16:00", "17:00",
    ]
    clash = client.post(
        f"{BASE}/appointments/group",
        json={
            "date": day.isoformat(), "time": "09:00",
            "customer_whatsapp": "3163330003",
            "customers": [{"name": "Tarde Uno", "service_ids": [corte["id"]]}],
        },
    )
    assert clash.status_code == 409
    availability = client.post(
        f"{BASE}/availability",
        json={"date": day.isoformat(),
              "service_ids": [corte["id"]]},
    ).json()
    assert "09:00" not in availability["slots"]  # el grupo quedó de verdad


def test_rebook_same_slot_next_weeks(client, tenant, professional):
    day = next_working_date(professional, weeks_ahead=18)
    services = _services(client)
    original = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "14:00",
            "customer_name": "Cliente Recurrente", "customer_whatsapp": "3164440001",
        },
    ).json()

    rebooked = client.post(
        f"{BASE}/appointments/{original['manage_code']}/rebook", json={"weeks": 2}
    )
    assert rebooked.status_code == 201, rebooked.text
    data = rebooked.json()
    assert data["time_local"] == "14:00"
    assert data["date_local"] == (day + timedelta(weeks=2)).isoformat()
    assert data["manage_code"] != original["manage_code"]

    # Repetir al mismo hueco dos veces → el segundo choca
    again = client.post(
        f"{BASE}/appointments/{original['manage_code']}/rebook", json={"weeks": 2}
    )
    assert again.status_code == 409


def test_products_catalog(client, admin_headers):
    created = client.post(
        f"{ADMIN}/products",
        json={"name": "Pomada mate", "description": "Fijación fuerte, brillo cero",
              "price_cop": 38000},
        headers=admin_headers,
    )
    assert created.status_code == 201
    product_id = created.json()["id"]

    public = client.get(f"{BASE}/products").json()
    assert any(p["id"] == product_id for p in public)

    # Desactivar lo saca de la vitrina pública
    client.patch(f"{ADMIN}/products/{product_id}", json={"is_active": False},
                 headers=admin_headers)
    public = client.get(f"{BASE}/products").json()
    assert not any(p["id"] == product_id for p in public)


