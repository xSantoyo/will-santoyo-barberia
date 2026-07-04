"""Despacho de eventos de dominio hacia n8n.

Principio (ADR-004): la cita NUNCA depende de la notificación. El webhook se
dispara después del commit, en background, con su propia sesión de DB, y todo
intento queda auditado en `notification_log`.

Firma HMAC-SHA256 del cuerpo en el header X-BadBoys-Signature para que n8n
pueda verificar el origen.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from zoneinfo import ZoneInfo

import httpx

from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..models import Appointment, NotificationLog, Tenant

logger = logging.getLogger("badboys.notifications")


def build_event_payload(tenant: Tenant, appointment: Appointment, event: str) -> dict:
    settings = get_settings()
    tz = ZoneInfo(tenant.timezone)
    local_start = appointment.starts_at.astimezone(tz)
    return {
        "event": event,
        "tenant": {
            "slug": tenant.slug,
            "name": tenant.name,
            "whatsapp_number": tenant.whatsapp_number,
        },
        "appointment": {
            "id": appointment.id,
            "manage_code": appointment.manage_code,
            "manage_url": f"{settings.public_base_url}/turno/{appointment.manage_code}",
            "daily_number": appointment.daily_number,
            "date_local": local_start.strftime("%Y-%m-%d"),
            "time_local": local_start.strftime("%H:%M"),
            "status": appointment.status,
            "customer_name": appointment.customer_name,
            "customer_whatsapp": appointment.customer_whatsapp,
            "barber": {"id": appointment.barber.id, "name": appointment.barber.name},
            "services": [
                {"name": s.name, "price_cop": s.price_cop, "duration_min": s.duration_min}
                for s in appointment.services
            ],
            "total_cop": appointment.total_cop,
            "cancel_reason": appointment.cancel_reason,
        },
    }


def sign_payload(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def dispatch_event(appointment_id: int, event: str) -> None:
    """Se ejecuta como BackgroundTask (post-respuesta). Sesión de DB propia:
    la de la request ya está cerrada cuando esto corre."""
    settings = get_settings()
    db = SessionLocal()
    try:
        appointment = db.get(Appointment, appointment_id)
        if appointment is None:
            return
        tenant = db.get(Tenant, appointment.tenant_id)
        log = NotificationLog(
            tenant_id=tenant.id, appointment_id=appointment.id, event_type=event
        )
        db.add(log)
        db.commit()

        if not settings.n8n_webhook_base:
            log.status = "fallido"
            log.detail = "N8N_WEBHOOK_BASE no configurado (webhooks deshabilitados)"
            db.commit()
            return

        payload = build_event_payload(tenant, appointment, event)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        url = f"{settings.n8n_webhook_base.rstrip('/')}/webhook/{event.replace('.', '-')}"
        try:
            response = httpx.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-BadBoys-Signature": sign_payload(body, settings.n8n_webhook_secret),
                },
                timeout=10.0,
            )
            response.raise_for_status()
            log.status = "enviado"
            log.sent_at = utcnow()
            log.detail = f"HTTP {response.status_code}"
        except httpx.HTTPError as exc:
            log.status = "fallido"
            log.detail = str(exc)[:500]
            logger.warning("Webhook %s falló para turno %s: %s", event, appointment_id, exc)
        db.commit()
    finally:
        db.close()


def log_notification(
    db, tenant_id: int, appointment_id: int | None, event_type: str,
    status: str = "enviado", detail: str | None = None,
) -> NotificationLog:
    """Registro directo (usado por n8n vía /internal para marcar recordatorios)."""
    log = NotificationLog(
        tenant_id=tenant_id,
        appointment_id=appointment_id,
        event_type=event_type,
        status=status,
        detail=detail,
        sent_at=utcnow() if status == "enviado" else None,
    )
    db.add(log)
    db.commit()
    return log
