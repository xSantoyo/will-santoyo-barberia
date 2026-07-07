"""Pasarela de pagos: Wompi (sandbox/producción) + simulador local.

Diseño:
- El corte se sigue pagando en el local. La pasarela cubre SOLO dos flujos:
  anticipo anti no-show (kind=deposit) y compra de regalos (kind=gift).
- `wompi_mode=mock` (default): checkout simulado local, cero llaves — permite
  demostrar y testear el flujo completo. Con las llaves del comercio se cambia
  a sandbox/production sin tocar código (Web Checkout de Wompi por redirect,
  nunca manipulamos datos de tarjeta).
- Idempotencia: los efectos (confirmar cita, emitir regalo) solo corren en la
  transición a `aprobado` y una sola vez.

Configuración por tenant (brand_config, editable desde el admin):
  deposits_enabled: bool · deposit_cop: int · gift_shop_enabled: bool
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from urllib.parse import quote, urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import Appointment, GiftCode, Payment, Tenant

WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/"
WOMPI_API = {
    "sandbox": "https://sandbox.wompi.co/v1",
    "production": "https://production.wompi.co/v1",
}
WOMPI_STATUS_MAP = {
    "APPROVED": "aprobado",
    "DECLINED": "rechazado",
    "VOIDED": "anulado",
    "ERROR": "error",
    "PENDING": "pendiente",
}
REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class PaymentError(Exception):
    def __init__(self, detail: str, status_code: int = 400, code: str = "payment_error"):
        self.detail = detail
        self.status_code = status_code
        self.code = code
        super().__init__(detail)


# ---------------------------------------------------------------- config tenant

def deposit_config(tenant: Tenant) -> dict:
    config = tenant.brand_config or {}
    return {
        "enabled": bool(config.get("deposits_enabled", False)),
        "amount_cop": max(1000, int(config.get("deposit_cop", 10000))),
    }


def gift_shop_enabled(tenant: Tenant) -> bool:
    return bool((tenant.brand_config or {}).get("gift_shop_enabled", False))


# ---------------------------------------------------------------- creación

def _new_reference(db: Session, prefix: str) -> str:
    for _ in range(20):
        reference = f"BB-{prefix}-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(8))
        if not db.scalar(select(Payment.id).where(Payment.reference == reference)):
            return reference
    raise RuntimeError("No fue posible generar una referencia de pago única")


def create_deposit_payment(db: Session, tenant: Tenant, appointment: Appointment) -> Payment:
    settings = get_settings()
    config = deposit_config(tenant)
    payment = Payment(
        tenant_id=tenant.id,
        kind="deposit",
        reference=_new_reference(db, "DEP"),
        amount_cents=config["amount_cop"] * 100,
        provider="mock" if settings.wompi_mode == "mock" else "wompi",
        appointment_id=appointment.id,
        payer_name=appointment.customer_name,
        payer_whatsapp=appointment.customer_whatsapp,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def create_gift_payment(
    db: Session, tenant: Tenant, *, amount_cop: int, description: str,
    payer_name: str, payer_whatsapp: str | None,
) -> Payment:
    settings = get_settings()
    payment = Payment(
        tenant_id=tenant.id,
        kind="gift",
        reference=_new_reference(db, "GIF"),
        amount_cents=amount_cop * 100,
        provider="mock" if settings.wompi_mode == "mock" else "wompi",
        payer_name=payer_name,
        payer_whatsapp=payer_whatsapp,
        detail={"gift_description": description},
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


# ---------------------------------------------------------------- checkout

def integrity_signature(reference: str, amount_cents: int, currency: str) -> str:
    """Firma de integridad del Web Checkout de Wompi:
    SHA256(referencia + monto_en_centavos + moneda + integrity_secret)."""
    settings = get_settings()
    raw = f"{reference}{amount_cents}{currency}{settings.wompi_integrity_secret}"
    return hashlib.sha256(raw.encode()).hexdigest()


def checkout_url(payment: Payment) -> str:
    """URL a la que se envía al cliente a pagar (redirect, sin datos de tarjeta)."""
    settings = get_settings()
    redirect = f"{settings.public_base_url}/pago/retorno?ref={quote(payment.reference)}"
    if settings.wompi_mode == "mock":
        params = urlencode({
            "ref": payment.reference,
            "amount": payment.amount_cop,
            "titulo": (
                "Anticipo de reserva" if payment.kind == "deposit" else "Regalo Bad Boys"
            ),
        })
        return f"{settings.public_base_url}/pago/simulado?{params}"
    params = {
        "public-key": settings.wompi_public_key,
        "currency": payment.currency,
        "amount-in-cents": str(payment.amount_cents),
        "reference": payment.reference,
        "signature:integrity": integrity_signature(
            payment.reference, payment.amount_cents, payment.currency
        ),
        "redirect-url": redirect,
    }
    return WOMPI_CHECKOUT_URL + "?" + urlencode(params)


# ---------------------------------------------------------------- efectos

def apply_result(
    db: Session,
    payment: Payment,
    *,
    status: str,
    method: str | None = None,
    transaction_id: str | None = None,
    raw: dict | None = None,
) -> Payment:
    """Aplica el resultado de la pasarela. Idempotente: un pago aprobado no se
    vuelve a procesar ni puede degradarse."""
    if payment.status == "aprobado":
        return payment
    payment.status = status
    payment.payment_method = method
    payment.provider_transaction_id = transaction_id or payment.provider_transaction_id
    if raw:
        payment.detail = {**(payment.detail or {}), "last_event": raw}

    if status == "aprobado":
        if payment.kind == "deposit" and payment.appointment_id:
            appointment = db.get(Appointment, payment.appointment_id)
            if appointment and appointment.status == "pendiente":
                appointment.status = "confirmado"  # el anticipo asegura la silla
        elif payment.kind == "gift" and payment.gift_code_id is None:
            gift = _issue_gift(db, payment)
            payment.gift_code_id = gift.id
    db.commit()
    db.refresh(payment)
    return payment


def _issue_gift(db: Session, payment: Payment) -> GiftCode:
    from ..services.appointments import CODE_ALPHABET

    code = None
    for _ in range(20):
        candidate = "G-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(GiftCode.id).where(GiftCode.code == candidate)):
            code = candidate
            break
    if code is None:
        raise RuntimeError("No fue posible generar un código de regalo único")
    gift = GiftCode(
        tenant_id=payment.tenant_id,
        code=code,
        description=payment.detail.get("gift_description", "Regalo Bad Boys"),
        created_by=f"pago en línea ({payment.payer_name or 'cliente'})",
        expires_at=utcnow() + timedelta(days=180),
    )
    db.add(gift)
    db.flush()
    return gift


def expire_stale_deposits(db: Session, tenant: Tenant) -> int:
    """Liberación perezosa: si el anticipo no se paga en deposit_ttl_minutes,
    la reserva pendiente se cancela y el hueco vuelve a la calle. Se invoca
    desde los mismos puntos que la liberación por no-confirmación."""
    settings = get_settings()
    threshold = utcnow() - timedelta(minutes=settings.deposit_ttl_minutes)
    stale = db.scalars(
        select(Payment).where(
            Payment.tenant_id == tenant.id,
            Payment.kind == "deposit",
            Payment.status.in_(("pendiente", "rechazado")),
            Payment.created_at < threshold,
        )
    )
    released = 0
    now = utcnow()
    for payment in stale:
        payment.status = "expirado"
        appointment = (
            db.get(Appointment, payment.appointment_id) if payment.appointment_id else None
        )
        if appointment and appointment.status == "pendiente":
            appointment.status = "cancelado"
            appointment.cancel_reason = "Liberado automáticamente: anticipo no pagado"
            appointment.cancelled_at = now
            released += 1
    if released:
        db.commit()
    return released


# ---------------------------------------------------------------- webhook Wompi

def verify_event_checksum(event: dict) -> bool:
    """Checksum de eventos Wompi: SHA256(concat(propiedades firmadas) +
    timestamp + events_secret)."""
    settings = get_settings()
    signature = event.get("signature") or {}
    properties: list[str] = signature.get("properties") or []
    provided = (signature.get("checksum") or "").lower()
    data = event.get("data") or {}

    concatenated = ""
    for prop in properties:
        node = data
        for part in prop.split("."):
            node = node.get(part) if isinstance(node, dict) else None
            if node is None:
                return False
        concatenated += str(node)
    raw = f"{concatenated}{event.get('timestamp', '')}{settings.wompi_events_secret}"
    expected = hashlib.sha256(raw.encode()).hexdigest()
    return bool(provided) and provided == expected


def handle_wompi_event(db: Session, tenant: Tenant, event: dict) -> Payment | None:
    if not verify_event_checksum(event):
        raise PaymentError("Checksum del evento inválido", 401, "bad_checksum")
    transaction = ((event.get("data") or {}).get("transaction")) or {}
    reference = transaction.get("reference")
    payment = db.scalar(
        select(Payment).where(
            Payment.tenant_id == tenant.id, Payment.reference == reference
        )
    )
    if payment is None:
        return None  # referencia ajena: se ignora (200 para no reintentar)
    status = WOMPI_STATUS_MAP.get(transaction.get("status", ""), "error")
    return apply_result(
        db,
        payment,
        status=status,
        method=transaction.get("payment_method_type"),
        transaction_id=transaction.get("id"),
        raw={"status": transaction.get("status"), "id": transaction.get("id")},
    )
