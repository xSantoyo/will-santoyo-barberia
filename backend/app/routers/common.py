"""Serializadores compartidos entre routers."""
from __future__ import annotations

from zoneinfo import ZoneInfo

from ..models import Appointment, Barber, Tenant
from ..schemas import AppointmentAdmin, AppointmentPublic, AppointmentServiceOut
from ..services.appointments import attendance_state
from ..services.storage import get_storage


def barber_photo_url(barber: Barber) -> str | None:
    if not barber.photo_key:
        return None
    return get_storage().public_url(barber.photo_key)


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
        barber_name=appointment.barber.name,
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
    )


def appointment_to_admin(appointment: Appointment, tenant: Tenant) -> AppointmentAdmin:
    tz = ZoneInfo(tenant.timezone)
    local_start = appointment.starts_at.astimezone(tz)
    local_end = appointment.ends_at.astimezone(tz)
    attendance = attendance_state(appointment)
    return AppointmentAdmin(
        id=appointment.id,
        barber_id=appointment.barber_id,
        barber_name=appointment.barber.name,
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
