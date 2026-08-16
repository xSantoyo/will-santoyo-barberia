"""Cálculo de disponibilidad de horarios.

Toda la aritmética se hace en la zona horaria del tenant (America/Bogota para
Bogotá); la base de datos guarda UTC. Un horario está disponible si:
  1. El barbero trabaja ese día (schedule semanal, no es descanso recurrente).
  2. No es una excepción puntual (time_off).
  3. El bloque [inicio, inicio+duración) cabe dentro de la jornada.
  4. No se solapa con ningún turno activo existente.
  5. Cumple la antelación mínima si la fecha es hoy.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import ACTIVE_STATUSES, Appointment, Professional, Tenant, TimeOff

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def weekday_key(day: date) -> str:
    return WEEKDAY_KEYS[day.weekday()]


def parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def day_schedule(professional: Professional, day: date) -> dict | None:
    """Bloque de trabajo {'start','end'} del barbero ese día, o None si descansa."""
    return (professional.schedule or {}).get(weekday_key(day)) or None


def is_time_off(db: Session, professional_id: int, day: date) -> bool:
    return (
        db.scalar(
            select(TimeOff.id).where(
                TimeOff.professional_id == professional_id, TimeOff.date == day
            )
        )
        is not None
    )


def active_appointments_for_day(
    db: Session, professional_id: int, day_start_utc: datetime, day_end_utc: datetime
) -> list[Appointment]:
    return list(
        db.scalars(
            select(Appointment).where(
                Appointment.professional_id == professional_id,
                Appointment.status.in_(ACTIVE_STATUSES),
                Appointment.starts_at < day_end_utc,
                Appointment.ends_at > day_start_utc,
            )
        )
    )


def compute_slots(
    db: Session,
    tenant: Tenant,
    professional: Professional,
    day: date,
    duration_min: int,
    *,
    enforce_lead: bool = True,
    include_break: bool = False,
) -> tuple[bool, list[str]]:
    """Devuelve (es_dia_de_descanso, ["HH:MM", ...]) en hora local del tenant.

    `include_break=True` incluye la pausa de almuerzo: solo lo usa el panel,
    donde Will puede agendar a mano dentro de su propia hora libre.
    """
    settings = get_settings()
    tz = ZoneInfo(tenant.timezone)

    sched = day_schedule(professional, day)
    if sched is None or is_time_off(db, professional.id, day):
        return True, []

    work_start = datetime.combine(day, parse_hhmm(sched["start"]), tzinfo=tz)
    work_end = datetime.combine(day, parse_hhmm(sched["end"]), tzinfo=tz)
    duration = timedelta(minutes=duration_min)
    step = timedelta(minutes=settings.slot_step_minutes)

    busy = active_appointments_for_day(db, professional.id, work_start, work_end)

    # Pausa de almuerzo: se descuenta de la oferta pública
    break_start = break_end = None
    if not include_break:
        break_start = datetime.combine(day, parse_hhmm(settings.public_break_start), tzinfo=tz)
        break_end = datetime.combine(day, parse_hhmm(settings.public_break_end), tzinfo=tz)

    min_start = None
    if enforce_lead:
        min_start = utcnow() + timedelta(minutes=settings.booking_lead_minutes)

    slots: list[str] = []
    cursor = work_start
    while cursor + duration <= work_end:
        en_almuerzo = (
            break_start is not None
            and cursor < break_end
            and cursor + duration > break_start
        )
        if (
            (min_start is None or cursor >= min_start)
            and not en_almuerzo
            and not any(
                cursor < a.ends_at and cursor + duration > a.starts_at for a in busy
            )
        ):
            slots.append(cursor.strftime("%H:%M"))
        cursor += step
    return False, slots
