"""Lógica de negocio de turnos: creación, cancelación, reprogramación.

La prevención de doble-reserva tiene dos capas:
  1. Validación de aplicación (este módulo) → errores 409 amigables.
  2. Constraint de exclusión en Postgres (migración 0001) → gana la carrera
     entre dos requests concurrentes; aquí se traduce IntegrityError a 409.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import (
    ACTIVE_STATUSES,
    Appointment,
    AppointmentService,
    Barber,
    Service,
    Tenant,
)
from ..schemas import BookingCreate
from .availability import day_schedule, is_time_off, parse_hhmm

# Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos dictables por teléfono
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# Transiciones de estado permitidas
STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pendiente": {"confirmado", "cancelado"},
    "confirmado": {"en_curso", "completado", "cancelado", "no_show"},
    "en_curso": {"completado", "cancelado"},
    "completado": set(),
    "cancelado": set(),
    "no_show": set(),
}


class BookingError(Exception):
    def __init__(self, detail: str, status_code: int = 400, code: str = "invalid"):
        self.detail = detail
        self.status_code = status_code
        self.code = code
        super().__init__(detail)


def generate_manage_code(db: Session, length: int = 6) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        exists = db.scalar(select(Appointment.id).where(Appointment.manage_code == code))
        if not exists:
            return code
    raise RuntimeError("No fue posible generar un código de gestión único")


def local_day_bounds(tenant: Tenant, day: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(tenant.timezone)
    start = datetime.combine(day, parse_hhmm("00:00"), tzinfo=tz)
    return start, start + timedelta(days=1)


def next_daily_number(db: Session, tenant: Tenant, barber_id: int, day: date) -> int:
    """Turno N° del día para el barbero. Monotónico: los cancelados conservan su
    número (renumerar confundiría a los clientes que ya recibieron el suyo)."""
    day_start, day_end = local_day_bounds(tenant, day)
    current_max = db.scalar(
        select(func.max(Appointment.daily_number)).where(
            Appointment.barber_id == barber_id,
            Appointment.starts_at >= day_start,
            Appointment.starts_at < day_end,
        )
    )
    return (current_max or 0) + 1


def _overlap_exists(
    db: Session, barber_id: int, starts_at: datetime, ends_at: datetime,
    exclude_id: int | None = None,
) -> bool:
    query = select(Appointment.id).where(
        Appointment.barber_id == barber_id,
        Appointment.status.in_(ACTIVE_STATUSES),
        Appointment.starts_at < ends_at,
        Appointment.ends_at > starts_at,
    )
    if exclude_id is not None:
        query = query.where(Appointment.id != exclude_id)
    return db.scalar(query) is not None


def _validate_slot(
    tenant: Tenant,
    barber: Barber,
    db: Session,
    day: date,
    time_str: str,
    duration_min: int,
    *,
    enforce_lead: bool,
) -> tuple[datetime, datetime]:
    """Valida reglas de calendario y devuelve (starts_at, ends_at) aware."""
    settings = get_settings()
    tz = ZoneInfo(tenant.timezone)
    starts_at = datetime.combine(day, parse_hhmm(time_str), tzinfo=tz)
    ends_at = starts_at + timedelta(minutes=duration_min)

    now = utcnow()
    if enforce_lead and starts_at < now + timedelta(minutes=settings.booking_lead_minutes):
        raise BookingError(
            "Ese horario ya no está disponible: la reserva requiere "
            f"al menos {settings.booking_lead_minutes} minutos de antelación.",
            409, "too_late",
        )
    if starts_at < now and not enforce_lead:
        raise BookingError("No se pueden crear turnos en el pasado.", 400, "past")
    if day > (now.astimezone(tz).date() + timedelta(days=settings.booking_horizon_days)):
        raise BookingError(
            f"Solo se puede reservar hasta {settings.booking_horizon_days} días adelante.",
            400, "horizon",
        )

    sched = day_schedule(barber, day)
    if sched is None or is_time_off(db, barber.id, day):
        raise BookingError(f"{barber.name} no trabaja ese día.", 409, "day_off")

    work_start = datetime.combine(day, parse_hhmm(sched["start"]), tzinfo=tz)
    work_end = datetime.combine(day, parse_hhmm(sched["end"]), tzinfo=tz)
    if starts_at < work_start or ends_at > work_end:
        raise BookingError(
            f"El horario está fuera de la jornada de {barber.name} "
            f"({sched['start']}–{sched['end']}).",
            409, "outside_schedule",
        )

    minutes = starts_at.astimezone(tz).minute
    if minutes % settings.slot_step_minutes != 0:
        raise BookingError(
            f"Los turnos inician cada {settings.slot_step_minutes} minutos.", 400, "misaligned"
        )
    return starts_at, ends_at


def load_barber(db: Session, tenant: Tenant, barber_id: int) -> Barber:
    barber = db.scalar(
        select(Barber).where(
            Barber.id == barber_id, Barber.tenant_id == tenant.id, Barber.is_active.is_(True)
        )
    )
    if barber is None:
        raise BookingError("Barbero no encontrado.", 404, "barber_not_found")
    return barber


def load_services(db: Session, tenant: Tenant, service_ids: list[int]) -> list[Service]:
    unique_ids = list(dict.fromkeys(service_ids))
    services = list(
        db.scalars(
            select(Service).where(
                Service.id.in_(unique_ids),
                Service.tenant_id == tenant.id,
                Service.is_active.is_(True),
            )
        )
    )
    if len(services) != len(unique_ids):
        raise BookingError("Alguno de los servicios no existe o no está activo.", 404,
                           "service_not_found")
    return services


def create_appointment(
    db: Session,
    tenant: Tenant,
    data: BookingCreate,
    *,
    enforce_lead: bool = True,
    status: str = "confirmado",
    notes: str | None = None,
) -> Appointment:
    barber = load_barber(db, tenant, data.barber_id)
    services = load_services(db, tenant, data.service_ids)
    duration_min = sum(s.duration_min for s in services)

    starts_at, ends_at = _validate_slot(
        tenant, barber, db, data.date, data.time, duration_min, enforce_lead=enforce_lead
    )

    if _overlap_exists(db, barber.id, starts_at, ends_at):
        raise BookingError(
            "Ese horario acaba de ser tomado por otra persona. Elige otro.", 409, "overlap"
        )

    appointment = Appointment(
        tenant_id=tenant.id,
        barber_id=barber.id,
        customer_name=data.customer_name,
        customer_whatsapp=data.customer_whatsapp,
        starts_at=starts_at,
        ends_at=ends_at,
        status=status,
        daily_number=next_daily_number(db, tenant, barber.id, data.date),
        manage_code=generate_manage_code(db),
        notes=notes,
    )
    for service in services:
        appointment.services.append(
            AppointmentService(
                service_id=service.id,
                name=service.name,
                price_cop=service.price_cop,
                duration_min=service.duration_min,
            )
        )
    db.add(appointment)
    try:
        db.commit()
    except IntegrityError:
        # Perdimos la carrera contra un INSERT concurrente: el constraint de
        # exclusión de Postgres (no_double_booking) rechazó el solapamiento.
        db.rollback()
        raise BookingError(
            "Ese horario acaba de ser tomado por otra persona. Elige otro.", 409, "overlap"
        ) from None
    db.refresh(appointment)
    return appointment


def cancel_appointment(
    db: Session,
    appointment: Appointment,
    *,
    reason: str | None,
    by_admin: bool,
) -> Appointment:
    if appointment.status not in ACTIVE_STATUSES:
        raise BookingError(
            f"El turno ya está en estado '{appointment.status}' y no se puede cancelar.",
            409, "not_cancellable",
        )
    if not by_admin:
        if appointment.status == "en_curso":
            raise BookingError("El turno ya está en curso.", 409, "not_cancellable")
        if appointment.starts_at <= utcnow():
            raise BookingError("El turno ya pasó y no se puede cancelar en línea.", 409,
                               "not_cancellable")
    appointment.status = "cancelado"
    appointment.cancel_reason = reason
    appointment.cancelled_at = utcnow()
    db.commit()
    db.refresh(appointment)
    return appointment


def reschedule_appointment(
    db: Session,
    tenant: Tenant,
    appointment: Appointment,
    *,
    new_barber_id: int | None,
    new_date: date,
    new_time: str,
) -> Appointment:
    if appointment.status not in ACTIVE_STATUSES:
        raise BookingError(
            f"No se puede reprogramar un turno en estado '{appointment.status}'.",
            409, "not_reschedulable",
        )
    barber = load_barber(db, tenant, new_barber_id or appointment.barber_id)
    duration_min = sum(s.duration_min for s in appointment.services)
    starts_at, ends_at = _validate_slot(
        tenant, barber, db, new_date, new_time, duration_min, enforce_lead=False
    )
    if _overlap_exists(db, barber.id, starts_at, ends_at, exclude_id=appointment.id):
        raise BookingError("El nuevo horario se solapa con otro turno.", 409, "overlap")

    barber_or_day_changed = (
        barber.id != appointment.barber_id
        or starts_at.astimezone(ZoneInfo(tenant.timezone)).date()
        != appointment.starts_at.astimezone(ZoneInfo(tenant.timezone)).date()
    )
    appointment.barber_id = barber.id
    appointment.starts_at = starts_at
    appointment.ends_at = ends_at
    if barber_or_day_changed:
        appointment.daily_number = next_daily_number(db, tenant, barber.id, new_date)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise BookingError("El nuevo horario se solapa con otro turno.", 409, "overlap") from None
    db.refresh(appointment)
    return appointment


def transition_status(db: Session, appointment: Appointment, new_status: str) -> Appointment:
    allowed = STATUS_TRANSITIONS.get(appointment.status, set())
    if new_status not in allowed:
        raise BookingError(
            f"Transición inválida: {appointment.status} → {new_status}.", 409, "bad_transition"
        )
    appointment.status = new_status
    if new_status == "cancelado":
        appointment.cancelled_at = utcnow()
    db.commit()
    db.refresh(appointment)
    return appointment
