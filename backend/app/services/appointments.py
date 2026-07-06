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
    ClientReferralCode,
    GiftCode,
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


def _resolve_referral(db: Session, tenant: Tenant, code: str, phone: str) -> str:
    row = db.scalar(
        select(ClientReferralCode).where(
            ClientReferralCode.tenant_id == tenant.id,
            ClientReferralCode.code == code.strip().upper(),
        )
    )
    if row is None:
        raise BookingError("Ese código de amigo no existe. Revísalo o déjalo vacío.",
                           404, "referral_invalid")
    if row.customer_whatsapp == phone:
        raise BookingError("El código de amigo no puede ser el tuyo.", 409, "referral_own")
    return row.code


def _hold_gift(db: Session, tenant: Tenant, code: str) -> GiftCode:
    gift = db.scalar(
        select(GiftCode).where(
            GiftCode.tenant_id == tenant.id, GiftCode.code == code.strip().upper()
        )
    )
    if gift is None:
        raise BookingError("Ese código de regalo no existe.", 404, "gift_invalid")
    if gift.redeemed_at is not None or gift.held_by_appointment_id is not None:
        raise BookingError("Ese código de regalo ya fue usado.", 409, "gift_used")
    if gift.expires_at is not None and gift.expires_at < utcnow():
        raise BookingError("Ese código de regalo ya venció.", 409, "gift_expired")
    return gift


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

    referred_by = (
        _resolve_referral(db, tenant, data.referral_code, data.customer_whatsapp)
        if data.referral_code
        else None
    )
    gift = _hold_gift(db, tenant, data.gift_code) if data.gift_code else None

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
        referred_by_code=referred_by,
        gift_code_id=gift.id if gift else None,
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
    if gift:
        gift.held_by_appointment_id = appointment.id  # queda reservado, no consumido
        db.commit()
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
    _release_gift_hold(db, appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


def _release_gift_hold(db: Session, appointment: Appointment) -> None:
    """Si la cita tenía un regalo reservado (no consumido), vuelve a quedar libre."""
    if appointment.gift_code_id is None:
        return
    gift = db.get(GiftCode, appointment.gift_code_id)
    if gift and gift.redeemed_at is None:
        gift.held_by_appointment_id = None
        appointment.gift_code_id = None


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


# ---------------------------------------------------------- asistencia

def attendance_state(appointment: Appointment) -> dict:
    """Estado de confirmación de asistencia de un turno.

    Solo se exige a reservas hechas con >= opens_hours de antelación (las de
    último minuto y los walk-ins no la necesitan). La ventana va desde
    opens_hours antes del turno hasta deadline_hours antes.
    """
    settings = get_settings()
    opens = timedelta(hours=settings.attendance_opens_hours)
    deadline = appointment.starts_at - timedelta(hours=settings.attendance_deadline_hours)
    required = (
        appointment.status == "confirmado"
        and appointment.created_at is not None
        and appointment.created_at <= appointment.starts_at - opens
    )
    confirmed = appointment.attendance_confirmed_at is not None
    now = utcnow()
    pending = (
        required
        and not confirmed
        and appointment.starts_at - opens <= now < deadline
    )
    return {
        "required": required,
        "confirmed": confirmed,
        "pending": pending,
        "deadline": deadline if required else None,
    }


def confirm_attendance(db: Session, appointment: Appointment) -> Appointment:
    if appointment.attendance_confirmed_at is not None:
        return appointment  # idempotente: ya confirmó
    if appointment.status != "confirmado":
        raise BookingError(
            f"El turno está en estado '{appointment.status}' y no admite confirmación.",
            409, "not_confirmable",
        )
    state = attendance_state(appointment)
    if not state["required"]:
        raise BookingError("Este turno no requiere confirmación de asistencia.", 409,
                           "not_required")
    now = utcnow()
    settings = get_settings()
    if now < appointment.starts_at - timedelta(hours=settings.attendance_opens_hours):
        raise BookingError(
            f"La confirmación se abre {settings.attendance_opens_hours} horas antes del turno.",
            409, "too_early",
        )
    if now >= state["deadline"]:
        raise BookingError(
            "La ventana de confirmación ya cerró.", 409, "too_late",
        )
    appointment.attendance_confirmed_at = now
    db.commit()
    db.refresh(appointment)
    return appointment


def release_unconfirmed(db: Session, tenant: Tenant) -> int:
    """Libera turnos confirmados que no confirmaron asistencia a tiempo.

    Sin cron: se invoca de forma perezosa desde los puntos de lectura/reserva
    (disponibilidad, fila, creación de turnos, dashboard) — el hueco queda
    disponible justo cuando alguien lo puede ver o tomar.
    """
    settings = get_settings()
    now = utcnow()
    opens = timedelta(hours=settings.attendance_opens_hours)
    deadline = timedelta(hours=settings.attendance_deadline_hours)

    candidates = db.scalars(
        select(Appointment).where(
            Appointment.tenant_id == tenant.id,
            Appointment.status == "confirmado",
            Appointment.attendance_confirmed_at.is_(None),
            Appointment.starts_at > now,               # aún no empieza
            Appointment.starts_at <= now + deadline,   # ya venció su ventana
        )
    )
    released = 0
    for appointment in candidates:
        # Filtro de antelación en Python: SQLite no hace aritmética de intervalos
        if appointment.created_at > appointment.starts_at - opens:
            continue  # reserva de último minuto: no requería confirmación
        appointment.status = "cancelado"
        appointment.cancel_reason = "Liberado automáticamente: no confirmó asistencia"
        appointment.cancelled_at = now
        released += 1
    if released:
        db.commit()
    return released


# ---------------------------------------------------------- walk-ins

def create_walk_in(
    db: Session,
    tenant: Tenant,
    *,
    barber_id: int,
    service_ids: list[int],
    customer_name: str,
    customer_whatsapp: str | None,
) -> Appointment:
    """Walk-in: el cliente está parado en el local. Toma el PRÓXIMO hueco de
    hoy en la agenda del barbero y entra a La Fila con su número y código."""
    from .availability import compute_slots

    barber = load_barber(db, tenant, barber_id)
    services = load_services(db, tenant, service_ids)
    duration_min = sum(s.duration_min for s in services)

    release_unconfirmed(db, tenant)  # primero libera huecos vencidos

    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    is_day_off, slots = compute_slots(
        db, tenant, barber, today, duration_min, enforce_lead=False
    )
    if is_day_off:
        raise BookingError(f"{barber.name} no trabaja hoy.", 409, "day_off")

    next_slot = next(
        (
            s for s in slots
            if datetime.combine(today, parse_hhmm(s), tzinfo=tz) >= now
        ),
        None,
    )
    if next_slot is None:
        raise BookingError(
            f"No queda espacio hoy en la agenda de {barber.name}.", 409, "full"
        )

    starts_at, ends_at = _validate_slot(
        tenant, barber, db, today, next_slot, duration_min, enforce_lead=False
    )
    if _overlap_exists(db, barber.id, starts_at, ends_at):
        raise BookingError("El hueco acaba de ocuparse, intenta de nuevo.", 409, "overlap")

    appointment = Appointment(
        tenant_id=tenant.id,
        barber_id=barber.id,
        customer_name=customer_name,
        customer_whatsapp=customer_whatsapp,
        starts_at=starts_at,
        ends_at=ends_at,
        status="confirmado",
        daily_number=next_daily_number(db, tenant, barber.id, today),
        manage_code=generate_manage_code(db),
        notes="Walk-in",
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
        db.rollback()
        raise BookingError("El hueco acaba de ocuparse, intenta de nuevo.", 409,
                           "overlap") from None
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
        _release_gift_hold(db, appointment)
    if new_status == "completado" and appointment.gift_code_id is not None:
        gift = db.get(GiftCode, appointment.gift_code_id)
        if gift and gift.redeemed_at is None:
            gift.redeemed_at = utcnow()  # el regalo se consume al completar la cita
    db.commit()
    db.refresh(appointment)
    return appointment


# ---------------------------------------------------------- grupo y repetición

def create_group_appointment(db: Session, tenant: Tenant, data) -> list[Appointment]:
    """Reserva grupal (Tanda 4, A7): turnos SEGUIDOS con el mismo barbero
    (padre e hijo, parche de amigos). Todo o nada: si un tramo no cabe,
    no se crea ninguno."""
    barber = load_barber(db, tenant, data.barber_id)
    created: list[Appointment] = []
    cursor_time = data.time
    base_number = next_daily_number(db, tenant, barber.id, data.date)
    tz = ZoneInfo(tenant.timezone)

    for index, member in enumerate(data.customers):
        services = load_services(db, tenant, member.service_ids)
        duration_min = sum(s.duration_min for s in services)
        starts_at, ends_at = _validate_slot(
            tenant, barber, db, data.date, cursor_time, duration_min,
            enforce_lead=(index == 0),
        )
        if _overlap_exists(db, barber.id, starts_at, ends_at):
            raise BookingError(
                f"El tramo de {member.name} ({cursor_time}) ya está ocupado. "
                "Elige otra hora de inicio.",
                409, "overlap",
            )
        appointment = Appointment(
            tenant_id=tenant.id,
            barber_id=barber.id,
            customer_name=member.name,
            customer_whatsapp=data.customer_whatsapp,
            starts_at=starts_at,
            ends_at=ends_at,
            status="confirmado",
            daily_number=base_number + index,
            manage_code=generate_manage_code(db),
            notes="Reserva grupal" if len(data.customers) > 1 else None,
        )
        for service in services:
            appointment.services.append(
                AppointmentService(
                    service_id=service.id, name=service.name,
                    price_cop=service.price_cop, duration_min=service.duration_min,
                )
            )
        db.add(appointment)
        created.append(appointment)
        cursor_time = ends_at.astimezone(tz).strftime("%H:%M")

    try:
        db.commit()  # una sola transacción: el constraint protege todos los tramos
    except IntegrityError:
        db.rollback()
        raise BookingError(
            "Alguno de los tramos acaba de ocuparse. Elige otra hora.", 409, "overlap"
        ) from None
    for appointment in created:
        db.refresh(appointment)
    return created


def rebook_appointment(db: Session, tenant: Tenant, appointment: Appointment,
                       weeks: int) -> Appointment:
    """Repetir turno (Tanda 4, A6): mismo barbero, misma hora, mismos servicios,
    N semanas después — la recurrencia honesta sin cron ni cobros."""
    if appointment.customer_whatsapp is None:
        raise BookingError("Este turno no tiene teléfono asociado.", 409, "no_phone")
    service_ids = [s.service_id for s in appointment.services if s.service_id is not None]
    if not service_ids:
        raise BookingError(
            "Los servicios de este turno ya no existen; agenda desde el inicio.",
            409, "services_gone",
        )
    tz = ZoneInfo(tenant.timezone)
    local_start = appointment.starts_at.astimezone(tz)
    data = BookingCreate(
        barber_id=appointment.barber_id,
        service_ids=service_ids,
        date=(local_start + timedelta(weeks=weeks)).date(),
        time=local_start.strftime("%H:%M"),
        customer_name=appointment.customer_name,
        customer_whatsapp=appointment.customer_whatsapp,
    )
    return create_appointment(db, tenant, data)
