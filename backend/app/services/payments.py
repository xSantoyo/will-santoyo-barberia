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
    payer_name: str, payer_whatsapp: str | None, payer_email: str | None = None,
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
        payer_email=payer_email,
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
                "Anticipo de reserva" if payment.kind == "deposit" else "Regalo"
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

    confirmed_appointment = None
    issued_gift = None
    if status == "aprobado":
        if payment.kind == "deposit" and payment.appointment_id:
            appointment = db.get(Appointment, payment.appointment_id)
            if appointment and appointment.status == "pendiente":
                appointment.status = "confirmado"  # el anticipo asegura la silla
                confirmed_appointment = appointment
        elif payment.kind == "gift" and payment.gift_code_id is None:
            issued_gift = _issue_gift(db, payment)
            payment.gift_code_id = issued_gift.id
    db.commit()
    db.refresh(payment)

    # Correos de cortesía DESPUÉS del commit: un fallo de envío nunca revierte
    # el pago (notifications atrapa todo internamente).
    from . import notifications

    tenant = db.get(Tenant, payment.tenant_id)
    if confirmed_appointment is not None and tenant is not None:
        notifications.send_booking_confirmation(db, tenant, confirmed_appointment)
    if issued_gift is not None and tenant is not None:
        notifications.send_gift_email(db, tenant, payment, issued_gift)
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
        description=payment.detail.get("gift_description", "Regalo"),
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

# Propiedades que Wompi SIEMPRE firma en eventos de transacción. Exigirlas
# impide que un evento con lista de propiedades recortada (p. ej. vacía)
# produzca un checksum trivial de forjar.
REQUIRED_SIGNED_PROPERTIES = {
    "transaction.id",
    "transaction.status",
    "transaction.amount_in_cents",
}


def verify_event_checksum(event: dict) -> bool:
    """Checksum de eventos Wompi: SHA256(concat(propiedades firmadas) +
    timestamp + events_secret). Comparación en tiempo constante."""
    import hmac

    settings = get_settings()
    signature = event.get("signature") or {}
    properties: list[str] = signature.get("properties") or []
    provided = (signature.get("checksum") or "").lower()
    data = event.get("data") or {}

    if not REQUIRED_SIGNED_PROPERTIES.issubset(set(properties)):
        return False

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
    return bool(provided) and hmac.compare_digest(provided, expected)


def handle_wompi_event(db: Session, tenant: Tenant, event: dict,
                       ip: str | None = None) -> Payment | None:
    from . import security as guard

    settings = get_settings()
    # En modo simulador no existe secret de eventos: con secret vacío el
    # checksum sería calculable por cualquiera. El webhook solo opera cuando
    # Wompi real (sandbox/producción) está configurado.
    if settings.wompi_mode == "mock" or not settings.wompi_events_secret:
        guard.log_event(db, kind="webhook_rejected", tenant_id=tenant.id, ip=ip,
                        detail={"reason": "wompi_no_configurado",
                                "mode": settings.wompi_mode})
        raise PaymentError("Webhook no disponible en este modo", 403, "webhook_disabled")

    if not verify_event_checksum(event):
        guard.log_event(db, kind="webhook_bad_signature", tenant_id=tenant.id, ip=ip)
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

    # El monto y la moneda del evento deben coincidir con lo que se cobró:
    # una transacción real de $1 no puede aprobar un anticipo de $20.000.
    if transaction.get("amount_in_cents") != payment.amount_cents or (
        transaction.get("currency") or payment.currency
    ) != payment.currency:
        guard.log_event(
            db, kind="webhook_bad_signature", tenant_id=tenant.id, ip=ip,
            detail={"reason": "monto_no_coincide", "reference": reference,
                    "expected_cents": payment.amount_cents,
                    "received_cents": transaction.get("amount_in_cents")},
        )
        raise PaymentError("El monto del evento no coincide con el pago", 400,
                           "amount_mismatch")

    status = WOMPI_STATUS_MAP.get(transaction.get("status", ""), "error")
    return apply_result(
        db,
        payment,
        status=status,
        method=transaction.get("payment_method_type"),
        transaction_id=transaction.get("id"),
        raw={"status": transaction.get("status"), "id": transaction.get("id")},
    )
