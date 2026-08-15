"""Correos transaccionales (Resend / outbox local): confirmación, recordatorio
por sweep perezoso y código de regalo. El correo es cortesía — nada del flujo
depende de él y siempre es opcional."""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from app.config import get_settings
from app.db import SessionLocal, utcnow
from app.models import Appointment

from .conftest import next_working_date

BASE = "/api/v1/public/will-santoyo"
ADMIN = "/api/v1/admin"


def _outbox() -> Path:
    return Path(get_settings().email_outbox_dir)


def _outbox_files(tag: str) -> list[Path]:
    if not _outbox().is_dir():
        return []
    return sorted(_outbox().glob(f"*-{tag}-*.html"))


def _emails_with(tag: str, needle: str) -> int:
    """Cuántos correos del tipo `tag` contienen `needle` (p. ej. un código).
    Asertar por contenido y no por conteo global evita flakiness si otro test
    escribe al outbox en el mismo segundo."""
    return sum(
        1 for f in _outbox_files(tag)
        if needle in f.read_text(encoding="utf-8")
    )


def _book(client, professional, day, time, *, email=None, phone="3186660001"):
    services = client.get(f"{BASE}/services").json()
    payload = {
        "service_ids": [services[0]["id"]],
        "date": day.isoformat(), "time": time,
        "customer_name": "Cliente Correo", "customer_whatsapp": phone,
    }
    if email is not None:
        payload["customer_email"] = email
    return client.post(f"{BASE}/appointments", json=payload)


def test_booking_with_email_sends_confirmation(client, professional, db):
    before = len(_outbox_files("confirmacion"))
    day = next_working_date(professional, weeks_ahead=40)
    response = _book(client, professional, day, "09:00",
                     email="Cliente@Ejemplo.COM ")
    assert response.status_code == 201, response.text
    code = response.json()["manage_code"]

    files = _outbox_files("confirmacion")
    assert len(files) == before + 1
    html = files[-1].read_text(encoding="utf-8")
    assert code in html                       # el código viaja en el correo
    assert "cliente@ejemplo.com" in html      # normalizado a minúsculas
    assert f"/turno/{code}" in html           # enlace al tiquete vivo

    appointment = db.scalar(
        db.query(Appointment).filter(Appointment.manage_code == code).statement
    )
    assert appointment.customer_email == "cliente@ejemplo.com"
    assert appointment.confirmation_email_sent_at is not None


def test_booking_without_email_sends_nothing(client, professional):
    before = len(_outbox_files("confirmacion"))
    day = next_working_date(professional, weeks_ahead=41)
    assert _book(client, professional, day, "10:00",
                 phone="3186660002").status_code == 201
    assert len(_outbox_files("confirmacion")) == before


def test_invalid_email_rejected(client, professional):
    day = next_working_date(professional, weeks_ahead=42)
    response = _book(client, professional, day, "11:00", email="no-es-un-correo",
                     phone="3186660003")
    assert response.status_code == 422


def test_reminder_sweep_sends_once(client, professional, tenant):
    """El recordatorio sale cuando la ventana de confirmación abre, una sola
    vez, disparado por el tráfico normal (sweep perezoso, sin cron)."""
    day = next_working_date(professional, weeks_ahead=43)
    response = _book(client, professional, day, "12:00",
                     email="recordar@ejemplo.com", phone="3186660004")
    assert response.status_code == 201
    code = response.json()["manage_code"]

    # Simula que la reserva se hizo hace 2 días y el turno es en 5 horas:
    # ventana de confirmación ABIERTA (24h antes) y deadline (3h) sin vencer.
    session = SessionLocal()
    from sqlalchemy import select

    appointment = session.scalar(
        select(Appointment).where(Appointment.manage_code == code)
    )
    now = utcnow()
    duration = appointment.ends_at - appointment.starts_at
    appointment.starts_at = now + timedelta(hours=5)
    appointment.ends_at = appointment.starts_at + duration
    appointment.created_at = now - timedelta(days=2)
    session.commit()

    # Cualquier consulta de disponibilidad dispara el sweep
    services = client.get(f"{BASE}/services").json()
    client.post(
        f"{BASE}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    )
    assert _emails_with("recordatorio", code) == 1

    # Idempotente: otro request no reenvía
    client.post(
        f"{BASE}/availability",
        json={"date": day.isoformat(),
              "service_ids": [services[0]["id"]]},
    )
    assert _emails_with("recordatorio", code) == 1
    session.close()


def test_gift_email_on_approval(client, admin_headers, tenant):
    """Al aprobarse el pago del regalo, el código llega al correo del comprador."""
    # Enciende la tienda para este test y la apaga al final
    client.patch(f"{ADMIN}/payment-settings",
                 json={"gift_shop_enabled": True}, headers=admin_headers)
    try:
        services = client.get(f"{BASE}/services").json()
        checkout = client.post(
            f"{BASE}/gifts/checkout",
            json={"service_id": services[0]["id"], "payer_name": "María Correo",
                  "payer_email": "maria@ejemplo.com"},
        ).json()
        approved = client.post(
            f"{BASE}/payments/{checkout['reference']}/simulate",
            json={"approve": True},
        ).json()
        assert _emails_with("regalo", approved["gift_code"]) == 1

        # Idempotente: reintentar el evento no duplica el correo
        client.post(f"{BASE}/payments/{checkout['reference']}/simulate",
                    json={"approve": True})
        assert _emails_with("regalo", approved["gift_code"]) == 1
    finally:
        client.patch(f"{ADMIN}/payment-settings",
                     json={"gift_shop_enabled": False}, headers=admin_headers)


def test_deposit_flow_emails_on_payment_approval(client, admin_headers, professional):
    """Con anticipo activo, la confirmación por correo sale al PAGAR, no antes."""
    client.patch(f"{ADMIN}/payment-settings",
                 json={"deposits_enabled": True, "deposit_cop": 10000},
                 headers=admin_headers)
    try:
        day = next_working_date(professional, weeks_ahead=44)
        booked = _book(client, professional, day, "13:00",
                       email="anticipo@ejemplo.com", phone="3186660005").json()
        assert booked["status"] == "pendiente", booked
        assert _emails_with("confirmacion", booked["manage_code"]) == 0  # aún nada

        client.post(
            f"{BASE}/payments/{booked['payment']['reference']}/simulate",
            json={"approve": True},
        )
        assert _emails_with("confirmacion", booked["manage_code"]) == 1
    finally:
        client.patch(f"{ADMIN}/payment-settings",
                     json={"deposits_enabled": False}, headers=admin_headers)
