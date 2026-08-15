"""Pasarela de pagos (modo simulador): anticipos anti no-show y regalos en línea.

El modo mock reproduce el ciclo completo de Wompi (checkout → resultado →
efectos) sin llaves; el webhook real se prueba con el checksum de eventos.
"""
from __future__ import annotations

import hashlib
from datetime import timedelta

import pytest

from app.db import SessionLocal, utcnow
from app.models import Payment

from .conftest import next_working_date

BASE = "/api/v1/public/will-santoyo"
ADMIN = "/api/v1/admin"


@pytest.fixture()
def deposits_on(tenant, admin_headers, client):
    """Activa anticipos ($10.000) y tienda de regalos vía el endpoint admin,
    y los desactiva al final para no afectar al resto de la suite."""
    response = client.patch(
        f"{ADMIN}/payment-settings",
        json={"deposits_enabled": True, "deposit_cop": 10000, "gift_shop_enabled": True},
        headers=admin_headers,
    )
    assert response.status_code == 200
    yield
    client.patch(
        f"{ADMIN}/payment-settings",
        json={"deposits_enabled": False, "gift_shop_enabled": False},
        headers=admin_headers,
    )


def _book(client, professional, day, time, phone="3171110001"):
    services = client.get(f"{BASE}/services").json()
    return client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": time,
            "customer_name": "Cliente Anticipo", "customer_whatsapp": phone,
        },
    )


def test_booking_without_deposits_stays_confirmed(client, professional):
    """Regresión: con los pagos APAGADOS (default) nada cambia."""
    day = next_working_date(professional, weeks_ahead=20)
    booked = _book(client, professional, day, "09:00")
    assert booked.status_code == 201
    assert booked.json()["status"] == "confirmado"
    assert booked.json()["payment"] is None


def test_deposit_flow_approve(client, professional, deposits_on):
    day = next_working_date(professional, weeks_ahead=21)
    booked = _book(client, professional, day, "10:00").json()

    # Nace pendiente, con pago requerido y checkout del simulador
    assert booked["status"] == "pendiente"
    payment = booked["payment"]
    assert payment["amount_cop"] == 10000
    assert payment["status"] == "pendiente"
    assert "/pago/simulado" in payment["checkout_url"]

    # El hueco queda tomado aunque no haya pagado aún
    services = client.get(f"{BASE}/services").json()
    availability = client.post(
        f"{BASE}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert "10:00" not in availability["slots"]

    # Aprueba en el simulador → la cita se confirma
    result = client.post(
        f"{BASE}/payments/{payment['reference']}/simulate", json={"approve": True}
    ).json()
    assert result["status"] == "aprobado"
    assert result["appointment_status"] == "confirmado"

    ticket = client.get(f"{BASE}/appointments/{booked['manage_code']}").json()
    assert ticket["status"] == "confirmado"
    assert ticket["payment"]["status"] == "aprobado"
    assert ticket["payment"]["checkout_url"] is None  # ya no hay nada que pagar

    # Idempotencia: reintentar el aprobado no rompe nada
    again = client.post(
        f"{BASE}/payments/{payment['reference']}/simulate", json={"approve": False}
    ).json()
    assert again["status"] == "aprobado"


def test_deposit_declined_then_retry_and_expiry(client, professional, deposits_on):
    day = next_working_date(professional, weeks_ahead=22)
    booked = _book(client, professional, day, "11:00", phone="3171110002").json()
    reference = booked["payment"]["reference"]

    declined = client.post(
        f"{BASE}/payments/{reference}/simulate", json={"approve": False}
    ).json()
    assert declined["status"] == "rechazado"
    assert declined["appointment_status"] == "pendiente"  # sigue esperando pago
    assert declined["checkout_url"] is not None  # puede reintentar

    # Se vence el plazo sin pagar → la reserva se libera sola
    db = SessionLocal()
    from sqlalchemy import select

    payment = db.scalar(select(Payment).where(Payment.reference == reference))
    payment.created_at = utcnow() - timedelta(minutes=45)
    db.commit()

    services = client.get(f"{BASE}/services").json()
    availability = client.post(
        f"{BASE}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    ).json()
    assert "11:00" in availability["slots"]  # hueco de vuelta en la calle

    ticket = client.get(f"{BASE}/appointments/{booked['manage_code']}").json()
    assert ticket["status"] == "cancelado"
    status = client.get(f"{BASE}/payments/{reference}").json()
    assert status["status"] == "expirado"
    db.close()


def test_gift_purchase_online(client, admin_headers, professional, deposits_on):
    services = client.get(f"{BASE}/services").json()
    corte = services[0]

    checkout = client.post(
        f"{BASE}/gifts/checkout",
        json={"service_id": corte["id"], "payer_name": "María Regaladora",
              "payer_whatsapp": "3171110003"},
    ).json()
    assert checkout["kind"] == "gift"
    assert checkout["amount_cop"] == corte["price_cop"]
    assert checkout["gift_code"] is None  # aún no paga

    approved = client.post(
        f"{BASE}/payments/{checkout['reference']}/simulate", json={"approve": True}
    ).json()
    assert approved["status"] == "aprobado"
    gift_code = approved["gift_code"]
    assert gift_code and gift_code.startswith("G-")

    # El código emitido es redimible en una reserva real (flujo existente)
    day = next_working_date(professional, weeks_ahead=23)
    redeemed = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [corte["id"]],
            "date": day.isoformat(), "time": "12:00",
            "customer_name": "Amigo Regalado", "customer_whatsapp": "3171110004",
            "gift_code": gift_code,
        },
    )
    assert redeemed.status_code == 201
    assert "regalo" in redeemed.json()["gift_description"].lower()

    # Y aparece en el listado del admin
    listing = client.get(f"{ADMIN}/gift-codes", headers=admin_headers).json()
    assert any(g["code"] == gift_code for g in listing)


def test_gift_shop_disabled_by_default(client):
    services = client.get(f"{BASE}/services").json()
    response = client.post(
        f"{BASE}/gifts/checkout",
        json={"service_id": services[0]["id"], "payer_name": "Nadie"},
    )
    assert response.status_code == 404


def _wompi_event(reference: str, *, amount_in_cents: int = 1000000,
                 secret: str = "test_events_secret",
                 properties: list[str] | None = None) -> dict:
    transaction = {
        "id": "1234-wompi", "status": "APPROVED", "amount_in_cents": amount_in_cents,
        "reference": reference, "payment_method_type": "NEQUI", "currency": "COP",
    }
    properties = properties or [
        "transaction.id", "transaction.status", "transaction.amount_in_cents",
    ]
    concatenated = ""
    for prop in properties:
        node: object = {"transaction": transaction}
        for part in prop.split("."):
            node = node.get(part) if isinstance(node, dict) else None
        concatenated += str(node)
    timestamp = 1720000000
    checksum = hashlib.sha256(f"{concatenated}{timestamp}{secret}".encode()).hexdigest()
    return {
        "event": "transaction.updated",
        "data": {"transaction": transaction},
        "timestamp": timestamp,
        "signature": {"properties": properties, "checksum": checksum},
    }


def test_wompi_webhook_checksum(client, professional, deposits_on, monkeypatch):
    """El webhook real de Wompi: checksum válido aplica el pago; inválido → 401."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "wompi_mode", "sandbox")
    monkeypatch.setattr(get_settings(), "wompi_events_secret", "test_events_secret")

    day = next_working_date(professional, weeks_ahead=24)
    booked = _book(client, professional, day, "13:00", phone="3171110005").json()
    reference = booked["payment"]["reference"]
    event = _wompi_event(reference)

    # Checksum adulterado → 401 y nada cambia
    bad = {**event, "signature": {**event["signature"], "checksum": "0" * 64}}
    assert client.post(f"{BASE}/payments/wompi/webhook", json=bad).status_code == 401

    ok = client.post(f"{BASE}/payments/wompi/webhook", json=event)
    assert ok.status_code == 200
    status = client.get(f"{BASE}/payments/{reference}").json()
    assert status["status"] == "aprobado"
    assert status["payment_method"] == "NEQUI"
    assert status["appointment_status"] == "confirmado"


def test_wompi_webhook_rejected_in_mock_mode(client, professional, deposits_on):
    """Con el simulador activo no hay events secret: el webhook no opera.
    (Con secret vacío el checksum sería forjable por cualquiera.)"""
    day = next_working_date(professional, weeks_ahead=25)
    booked = _book(client, professional, day, "13:00", phone="3171110006").json()
    event = _wompi_event(booked["payment"]["reference"], secret="")
    assert client.post(f"{BASE}/payments/wompi/webhook", json=event).status_code == 403


def test_wompi_webhook_amount_mismatch(client, professional, deposits_on, monkeypatch):
    """Un evento firmado pero con monto distinto al del pago NO lo aprueba."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "wompi_mode", "sandbox")
    monkeypatch.setattr(get_settings(), "wompi_events_secret", "test_events_secret")

    day = next_working_date(professional, weeks_ahead=26)
    booked = _book(client, professional, day, "14:00", phone="3171110007").json()
    reference = booked["payment"]["reference"]

    event = _wompi_event(reference, amount_in_cents=100)  # $1 en vez de $10.000
    assert client.post(f"{BASE}/payments/wompi/webhook", json=event).status_code == 400
    status = client.get(f"{BASE}/payments/{reference}").json()
    assert status["status"] == "pendiente"


def test_wompi_webhook_requires_signed_properties(client, professional, deposits_on,
                                                  monkeypatch):
    """Un evento cuya firma no cubre id/status/monto se rechaza aunque el
    checksum 'cuadre': impide firmas sobre listas de propiedades recortadas."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "wompi_mode", "sandbox")
    monkeypatch.setattr(get_settings(), "wompi_events_secret", "test_events_secret")

    day = next_working_date(professional, weeks_ahead=27)
    booked = _book(client, professional, day, "15:00", phone="3171110008").json()
    reference = booked["payment"]["reference"]

    event = _wompi_event(reference, properties=["transaction.status"])
    assert client.post(f"{BASE}/payments/wompi/webhook", json=event).status_code == 401