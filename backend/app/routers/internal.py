"""Endpoints internos consumidos por los crons de n8n (sección 11 del spec).

Autenticación: header X-Service-Key (secreto compartido con n8n).
Estos endpoints devuelven payloads listos para plantillas de WhatsApp.
"""
from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..db import get_db, utcnow
from ..deps import require_service_key
from ..models import (
    ACTIVE_STATUSES,
    Appointment,
    Barber,
    NotificationLog,
    Tenant,
)
from ..services.appointments import local_day_bounds
from ..services.notifications import build_event_payload, log_notification

router = APIRouter(
    prefix="/api/v1/internal",
    tags=["internal"],
    dependencies=[Depends(require_service_key)],
)


def _appointment_query():
    return select(Appointment).options(
        selectinload(Appointment.services), selectinload(Appointment.barber)
    )


@router.get("/appointments/upcoming-reminders")
def upcoming_reminders(db: Session = Depends(get_db)):
    """Turnos confirmados que empiezan en las próximas 24h y aún no tienen
    recordatorio registrado. n8n envía el WhatsApp y luego llama a
    /appointments/{id}/notification-log para marcarlo."""
    now = utcnow()
    window_end = now + timedelta(hours=24)

    already_reminded = select(NotificationLog.appointment_id).where(
        NotificationLog.event_type == "reminder_24h",
        NotificationLog.status == "enviado",
    )
    appointments = db.scalars(
        _appointment_query().where(
            Appointment.status == "confirmado",
            Appointment.starts_at >= now,
            Appointment.starts_at <= window_end,
            Appointment.id.not_in(already_reminded),
        )
    )
    result = []
    for appointment in appointments:
        tenant = db.get(Tenant, appointment.tenant_id)
        result.append(build_event_payload(tenant, appointment, "reminder_24h"))
    return {"count": len(result), "items": result}


@router.post("/appointments/{appointment_id}/notification-log", status_code=201)
def mark_notified(
    appointment_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """n8n reporta el resultado del envío para auditoría e idempotencia."""
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(404, "Turno no encontrado")
    event_type = body.get("event_type", "reminder_24h")
    status = body.get("status", "enviado")
    if status not in ("enviado", "fallido"):
        raise HTTPException(400, "status debe ser enviado|fallido")
    log = log_notification(
        db, appointment.tenant_id, appointment.id, event_type, status,
        detail=body.get("detail"),
    )
    return {"id": log.id}


@router.get("/agenda/today")
def agenda_today(db: Session = Depends(get_db)):
    """Resumen diario por barbero (cron 7:00 a.m.): agenda del día de cada
    barbero de cada tenant, lista para el mensaje de WhatsApp."""
    result = []
    for tenant in db.scalars(select(Tenant)):
        tz = ZoneInfo(tenant.timezone)
        today = utcnow().astimezone(tz).date()
        day_start, day_end = local_day_bounds(tenant, today)
        barbers = db.scalars(
            select(Barber).where(Barber.tenant_id == tenant.id, Barber.is_active.is_(True))
        )
        tenant_block = {
            "tenant": {"slug": tenant.slug, "name": tenant.name,
                       "whatsapp_number": tenant.whatsapp_number},
            "date_local": today.isoformat(),
            "barbers": [],
        }
        for barber in barbers:
            appointments = db.scalars(
                _appointment_query()
                .where(
                    Appointment.barber_id == barber.id,
                    Appointment.status.in_(ACTIVE_STATUSES),
                    Appointment.starts_at >= day_start,
                    Appointment.starts_at < day_end,
                )
                .order_by(Appointment.starts_at)
            )
            tenant_block["barbers"].append(
                {
                    "id": barber.id,
                    "name": barber.name,
                    "appointments": [
                        {
                            "time_local": a.starts_at.astimezone(tz).strftime("%H:%M"),
                            "daily_number": a.daily_number,
                            "customer_name": a.customer_name,
                            "services": [s.name for s in a.services],
                            "total_cop": a.total_cop,
                        }
                        for a in appointments
                    ],
                }
            )
        result.append(tenant_block)
    return {"items": result}


@router.get("/appointments/overdue")
def overdue_appointments(db: Session = Depends(get_db)):
    """Turnos aún 'confirmado' cuya hora de inicio pasó hace más del período de
    gracia (cron cada 15 min): candidatos a no-show, alerta interna al admin."""
    settings = get_settings()
    threshold = utcnow() - timedelta(minutes=settings.no_show_grace_minutes)
    appointments = db.scalars(
        _appointment_query().where(
            Appointment.status == "confirmado",
            Appointment.starts_at < threshold,
        )
    )
    result = []
    for appointment in appointments:
        tenant = db.get(Tenant, appointment.tenant_id)
        result.append(build_event_payload(tenant, appointment, "no_show_alert"))
    return {"count": len(result), "items": result}
