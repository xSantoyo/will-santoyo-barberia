"""Serializadores compartidos entre routers."""
from __future__ import annotations

from zoneinfo import ZoneInfo

from ..models import Appointment, Professional, Tenant
from ..schemas import (
    AppointmentAdmin,
    AppointmentPublic,
    AppointmentServiceOut,
    PaymentPublic,
    ProfessionalPublic,
)
from ..services import payments as payments_service
from ..services.appointments import attendance_state
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
        payment=_deposit_payment(appointment),
    )


def _deposit_payment(appointment: Appointment) -> PaymentPublic | None:
    deposit = next((p for p in appointment.payments if p.kind == "deposit"), None)
    if deposit is None:
        return None
    payable = deposit.status in ("pendiente", "rechazado")
    return PaymentPublic(
        reference=deposit.reference,
        kind=deposit.kind,
        status=deposit.status,
        amount_cop=deposit.amount_cop,
        checkout_url=payments_service.checkout_url(deposit) if payable else None,
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
