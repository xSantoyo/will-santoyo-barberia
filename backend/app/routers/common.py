"""Serializadores compartidos entre routers."""
from __future__ import annotations

from zoneinfo import ZoneInfo

from ..models import Appointment, Professional, Tenant
from ..schemas import (
    AppointmentAdmin,
    AppointmentPublic,
    AppointmentServiceOut,
    ProfessionalPublic,
)
from ..services.appointments import attendance_state, cancel_window_open
from ..services.storage import get_storage


def professional_photo_url(professional: Professional) -> str | None:
    if not professional.photo_key:
        return None
    return get_storage().public_url(professional.photo_key)


def professional_to_public(professional: Professional) -> ProfessionalPublic:
    return ProfessionalPublic(
        name=professional.name,
        headline=professional.headline,
        instagram=professional.instagram,
        photo_url=professional_photo_url(professional),
        schedule=professional.schedule or {},
    )


def _cancel_blocked_reason(appointment: Appointment) -> str | None:
    """Por qué NO se puede cancelar, en palabras para el cliente."""
    from ..config import get_settings

    if cancel_window_open(appointment):
        return None
    if appointment.status == "cancelado":
        return "Este turno ya está cancelado."
    if appointment.status in ("completado", "no_show"):
        return "Este turno ya se cerró."
    if appointment.status == "en_curso":
        return "Tu turno ya empezó."
    return (
        "Ya no se puede cancelar este turno: faltan menos de "
        f"{get_settings().cancel_window_minutes} minutos para empezar."
    )


def appointment_to_public(appointment: Appointment, tenant: Tenant) -> AppointmentPublic:
    tz = ZoneInfo(tenant.timezone)
    local = appointment.starts_at.astimezone(tz)
    attendance = attendance_state(appointment)
    return AppointmentPublic(
        manage_code=appointment.manage_code,
        status=appointment.status,
        daily_number=appointment.daily_number,
        date_local=local.strftime("%Y-%m-%d"),
        time_local=local.strftime("%H:%M"),
        customer_name=appointment.customer_name,
        services=[AppointmentServiceOut.model_validate(s) for s in appointment.services],
        total_cop=appointment.total_cop,
        attendance_pending=attendance["pending"],
        attendance_confirmed=attendance["confirmed"],
        attendance_deadline_local=(
            attendance["deadline"].astimezone(tz).strftime("%H:%M")
            if attendance["pending"] and attendance["deadline"]
            else None
        ),
        can_review=appointment.status == "completado" and appointment.review is None,
        review_rating=appointment.review.rating if appointment.review else None,
        gift_description=appointment.gift.description if appointment.gift else None,
        can_cancel=cancel_window_open(appointment),
        cancel_blocked_reason=_cancel_blocked_reason(appointment),
    )


def appointment_to_admin(appointment: Appointment, tenant: Tenant) -> AppointmentAdmin:
    tz = ZoneInfo(tenant.timezone)
    local_start = appointment.starts_at.astimezone(tz)
    local_end = appointment.ends_at.astimezone(tz)
    attendance = attendance_state(appointment)
    return AppointmentAdmin(
        id=appointment.id,
        customer_name=appointment.customer_name,
        customer_whatsapp=appointment.customer_whatsapp,
        status=appointment.status,
        attendance_confirmed=attendance["confirmed"],
        attendance_pending=attendance["pending"],
        daily_number=appointment.daily_number,
        manage_code=appointment.manage_code,
        date_local=local_start.strftime("%Y-%m-%d"),
        time_local=local_start.strftime("%H:%M"),
        end_time_local=local_end.strftime("%H:%M"),
        services=[AppointmentServiceOut.model_validate(s) for s in appointment.services],
        total_cop=appointment.total_cop,
        notes=appointment.notes,
        cancel_reason=appointment.cancel_reason,
        created_at=appointment.created_at,
    )
