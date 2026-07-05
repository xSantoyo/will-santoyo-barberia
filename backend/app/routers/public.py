"""API pública (sin autenticación): sitio web, flujo de agendamiento y
la Fila en vivo (tablero de turnos del día).

Prefijo: /api/v1/public/{tenant_slug}
Los endpoints de escritura llevan rate limiting por IP.
"""
from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db, utcnow
from ..deps import booking_rate_limiter, get_tenant_by_slug
from ..models import (
    ACTIVE_STATUSES,
    Appointment,
    Barber,
    BarberTimeOff,
    MediaAsset,
    Review,
    Service,
    Tenant,
)
from ..schemas import (
    AppointmentFind,
    AppointmentPublic,
    AvailabilityQuery,
    BarberPublic,
    BookingCreate,
    CancelRequest,
    DayAvailability,
    MediaAssetOut,
    PortalRequest,
    ReviewCreate,
    ReviewPublic,
    ServicePublic,
    TenantPublic,
)
from ..services import appointments as booking
from ..services import clients as clients_service
from ..services.availability import compute_slots
from ..services.storage import get_storage
from .common import appointment_to_public, barber_photo_url

router = APIRouter(prefix="/api/v1/public/{tenant_slug}", tags=["public"])


def _handle_booking_error(exc: booking.BookingError) -> HTTPException:
    return HTTPException(exc.status_code, {"code": exc.code, "message": exc.detail})


@router.get("", response_model=TenantPublic)
def tenant_info(tenant: Tenant = Depends(get_tenant_by_slug)):
    return tenant


@router.get("/barbers", response_model=list[BarberPublic])
def list_barbers(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    barbers = db.scalars(
        select(Barber)
        .where(Barber.tenant_id == tenant.id, Barber.is_active.is_(True))
        .order_by(Barber.sort_order, Barber.id)
    )
    result = []
    for barber in barbers:
        item = BarberPublic.model_validate(barber)
        item.photo_url = barber_photo_url(barber)
        result.append(item)
    return result


@router.get("/services", response_model=list[ServicePublic])
def list_services(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    return list(
        db.scalars(
            select(Service)
            .where(Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .order_by(Service.sort_order, Service.id)
        )
    )


@router.get("/barbers/{barber_id}/time-off")
def barber_time_off(
    barber_id: int,
    start: date,
    end: date,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Fechas de descanso puntual (excepciones) para pintar el calendario."""
    rows = db.scalars(
        select(BarberTimeOff).where(
            BarberTimeOff.tenant_id == tenant.id,
            BarberTimeOff.barber_id == barber_id,
            BarberTimeOff.date >= start,
            BarberTimeOff.date <= end,
        )
    )
    return {"dates": [r.date.isoformat() for r in rows]}


@router.post("/availability", response_model=DayAvailability)
def availability(
    query: AvailabilityQuery,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    booking.release_unconfirmed(db, tenant)  # libera huecos vencidos antes de mostrar
    try:
        barber = booking.load_barber(db, tenant, query.barber_id)
        services = booking.load_services(db, tenant, query.service_ids)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    duration = sum(s.duration_min for s in services)
    is_day_off, slots = compute_slots(db, tenant, barber, query.date, duration)
    return DayAvailability(date=query.date, is_day_off=is_day_off, slots=slots)


@router.post(
    "/appointments",
    response_model=AppointmentPublic,
    status_code=201,
    dependencies=[Depends(booking_rate_limiter)],
)
def create_booking(
    data: BookingCreate,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    # El código de gestión devuelto aquí es el ÚNICO canal de gestión del
    # cliente (ADR-009): el frontend lo muestra de forma prominente.
    booking.release_unconfirmed(db, tenant)
    try:
        appointment = booking.create_appointment(db, tenant, data)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    return appointment_to_public(appointment, tenant)


def _load_by_code(db: Session, tenant: Tenant, manage_code: str) -> Appointment:
    appointment = db.scalar(
        select(Appointment)
        .options(selectinload(Appointment.services), selectinload(Appointment.barber))
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.manage_code == manage_code.strip().upper(),
        )
    )
    if appointment is None:
        raise HTTPException(404, "Turno no encontrado. Verifica el código.")
    return appointment


@router.get("/appointments/{manage_code}", response_model=AppointmentPublic)
def get_appointment(
    manage_code: str,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    return appointment_to_public(_load_by_code(db, tenant, manage_code), tenant)


@router.post(
    "/appointments/find",
    response_model=AppointmentPublic,
    dependencies=[Depends(booking_rate_limiter)],
)
def find_appointment(
    data: AppointmentFind,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Búsqueda por teléfono + código (cuando el cliente perdió el enlace)."""
    appointment = _load_by_code(db, tenant, data.manage_code)
    if appointment.customer_whatsapp != data.customer_whatsapp:
        raise HTTPException(404, "Turno no encontrado. Verifica el código y el teléfono.")
    return appointment_to_public(appointment, tenant)


@router.post(
    "/appointments/{manage_code}/confirm",
    response_model=AppointmentPublic,
    dependencies=[Depends(booking_rate_limiter)],
)
def confirm_attendance(
    manage_code: str,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """El cliente confirma desde su tiquete que sigue en pie (Tanda 2)."""
    appointment = _load_by_code(db, tenant, manage_code)
    try:
        appointment = booking.confirm_attendance(db, appointment)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    return appointment_to_public(appointment, tenant)


@router.post(
    "/appointments/{manage_code}/cancel",
    response_model=AppointmentPublic,
    dependencies=[Depends(booking_rate_limiter)],
)
def cancel_appointment(
    manage_code: str,
    data: CancelRequest,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    appointment = _load_by_code(db, tenant, manage_code)
    try:
        appointment = booking.cancel_appointment(
            db, appointment, reason=data.reason, by_admin=False
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    return appointment_to_public(appointment, tenant)


# ------------------------------------------------------------- tanda 3

def _review_label(name: str) -> str:
    parts = name.split()
    return parts[0] + (f" {parts[1][0]}." if len(parts) > 1 else "")


def _review_to_public(review: Review, tenant: Tenant) -> ReviewPublic:
    tz = ZoneInfo(tenant.timezone)
    return ReviewPublic(
        rating=review.rating,
        comment=review.comment,
        customer_label=_review_label(review.customer_name),
        barber_name=review.appointment.barber.name,
        date_local=review.created_at.astimezone(tz).strftime("%Y-%m-%d"),
    )


@router.post("/portal", dependencies=[Depends(booking_rate_limiter)])
def client_portal(
    data: PortalRequest,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Portal ligero sin contraseña (Tanda 3): el teléfono es la llave y
    cualquier código de gestión propio hace de comprobante."""
    key_appointment = _load_by_code(db, tenant, data.manage_code)
    if key_appointment.customer_whatsapp != data.customer_whatsapp:
        raise HTTPException(404, "Turno no encontrado. Verifica el código y el teléfono.")

    appointments = db.scalars(
        select(Appointment)
        .options(
            selectinload(Appointment.services),
            selectinload(Appointment.barber),
            selectinload(Appointment.review),
        )
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.customer_whatsapp == data.customer_whatsapp,
        )
        .order_by(Appointment.starts_at.desc())
        .limit(60)
    )
    tz = ZoneInfo(tenant.timezone)
    history = [
        {
            "manage_code": a.manage_code,
            "date_local": a.starts_at.astimezone(tz).strftime("%Y-%m-%d"),
            "time_local": a.starts_at.astimezone(tz).strftime("%H:%M"),
            "status": a.status,
            "barber_name": a.barber.name,
            "services": [s.name for s in a.services],
            "total_cop": a.total_cop,
            "can_review": a.status == "completado" and a.review is None,
            "review_rating": a.review.rating if a.review else None,
        }
        for a in appointments
    ]
    return {
        "customer_name": key_appointment.customer_name,
        "appointments": history,
        "loyalty": clients_service.loyalty_status(db, tenant, data.customer_whatsapp),
    }


@router.post(
    "/appointments/{manage_code}/review",
    response_model=ReviewPublic,
    status_code=201,
    dependencies=[Depends(booking_rate_limiter)],
)
def leave_review(
    manage_code: str,
    data: ReviewCreate,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Reseña verificada: solo de una cita real completada, una por cita."""
    appointment = _load_by_code(db, tenant, manage_code)
    if appointment.status != "completado":
        raise HTTPException(
            409, {"code": "not_completed",
                  "message": "Solo puedes reseñar un turno ya completado."}
        )
    if appointment.review is not None:
        raise HTTPException(
            409, {"code": "already_reviewed",
                  "message": "Este turno ya tiene su reseña. ¡Gracias!"}
        )
    review = Review(
        tenant_id=tenant.id,
        appointment_id=appointment.id,
        barber_id=appointment.barber_id,
        customer_whatsapp=appointment.customer_whatsapp,
        customer_name=appointment.customer_name,
        rating=data.rating,
        comment=(data.comment or "").strip() or None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_to_public(review, tenant)


@router.get("/reviews")
def list_reviews(
    barber_id: int | None = None,
    limit: int = 12,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Reseñas públicas recientes + promedios (general y por barbero)."""
    from sqlalchemy import func

    stats_rows = db.execute(
        select(Review.barber_id, func.avg(Review.rating), func.count(Review.id))
        .where(Review.tenant_id == tenant.id, Review.is_public.is_(True))
        .group_by(Review.barber_id)
    ).all()
    per_barber = {
        str(row[0]): {"average": round(float(row[1]), 1), "count": row[2]}
        for row in stats_rows
    }
    total = sum(row[2] for row in stats_rows)
    overall = (
        round(sum(float(row[1]) * row[2] for row in stats_rows) / total, 1) if total else None
    )

    query = (
        select(Review)
        .options(selectinload(Review.appointment).selectinload(Appointment.barber))
        .where(Review.tenant_id == tenant.id, Review.is_public.is_(True))
    )
    if barber_id:
        query = query.where(Review.barber_id == barber_id)
    reviews = db.scalars(query.order_by(Review.id.desc()).limit(min(limit, 30)))
    return {
        "overall": {"average": overall, "count": total},
        "per_barber": per_barber,
        "items": [_review_to_public(r, tenant) for r in reviews],
    }


# ---------------------------------------------------------------- La Fila

def _weekday_key(day: date) -> str:
    return ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day.weekday()]


@router.get("/queue")
def today_queue(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    """La Fila en vivo: estado de los turnos de HOY por barbero.

    Pensado para el tablero público (/hoy) y la pantalla del local.
    Privacidad: solo números de turno, horas y estados — nunca nombres
    ni teléfonos de clientes.
    """
    from ..services.appointments import local_day_bounds
    from ..services.availability import is_time_off

    booking.release_unconfirmed(db, tenant)

    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    day_start, day_end = local_day_bounds(tenant, today)

    barbers = db.scalars(
        select(Barber)
        .where(Barber.tenant_id == tenant.id, Barber.is_active.is_(True))
        .order_by(Barber.sort_order, Barber.id)
    )
    appointments = list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.tenant_id == tenant.id,
                Appointment.starts_at >= day_start,
                Appointment.starts_at < day_end,
            )
            .order_by(Appointment.starts_at)
        )
    )

    lanes = []
    for barber in barbers:
        own = [a for a in appointments if a.barber_id == barber.id]
        current = next((a for a in own if a.status == "en_curso"), None)
        waiting = [
            a for a in own
            if a.status in ("pendiente", "confirmado") and a.ends_at > now
        ]
        done = [a for a in own if a.status == "completado"]
        is_off = (barber.schedule or {}).get(_weekday_key(today)) is None or is_time_off(
            db, barber.id, today
        )
        lanes.append(
            {
                "barber": {"id": barber.id, "name": barber.name},
                "is_day_off": is_off,
                "current": (
                    {
                        "number": current.daily_number,
                        "time_local": current.starts_at.astimezone(tz).strftime("%H:%M"),
                    }
                    if current
                    else None
                ),
                "waiting": [
                    {
                        "number": a.daily_number,
                        "time_local": a.starts_at.astimezone(tz).strftime("%H:%M"),
                    }
                    for a in waiting
                ],
                "served_count": len(done),
                "last_served_number": max((a.daily_number for a in done), default=None),
            }
        )
    return {
        "date_local": today.isoformat(),
        "now_local": now.astimezone(tz).strftime("%H:%M"),
        "lanes": lanes,
    }


@router.get("/appointments/{manage_code}/queue")
def appointment_queue_position(
    manage_code: str,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Posición en la fila para el tiquete vivo del cliente: cuántos turnos
    activos van antes del suyo (mismo barbero, mismo día local)."""
    appointment = _load_by_code(db, tenant, manage_code)
    tz = ZoneInfo(tenant.timezone)
    local_day = appointment.starts_at.astimezone(tz).date()
    is_today = local_day == utcnow().astimezone(tz).date()

    ahead = db.scalars(
        select(Appointment).where(
            Appointment.barber_id == appointment.barber_id,
            Appointment.status.in_(ACTIVE_STATUSES),
            Appointment.starts_at < appointment.starts_at,
            Appointment.starts_at
            >= appointment.starts_at.astimezone(tz).replace(
                hour=0, minute=0, second=0, microsecond=0
            ),
        )
    )
    ahead_list = list(ahead)
    now_serving = next((a.daily_number for a in ahead_list if a.status == "en_curso"), None)

    return {
        "is_today": is_today,
        "status": appointment.status,
        "number": appointment.daily_number,
        "barber_name": appointment.barber.name,
        "time_local": appointment.starts_at.astimezone(tz).strftime("%H:%M"),
        "ahead_count": len(ahead_list) if appointment.status in ACTIVE_STATUSES else 0,
        "now_serving": now_serving,
    }


@router.get("/media", response_model=list[MediaAssetOut])
def list_media(
    kind: str | None = None,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    query = select(MediaAsset).where(MediaAsset.tenant_id == tenant.id)
    if kind:
        query = query.where(MediaAsset.kind == kind)
    storage = get_storage()
    result = []
    for asset in db.scalars(query.order_by(MediaAsset.sort_order, MediaAsset.id)):
        item = MediaAssetOut.model_validate(asset)
        item.url = storage.public_url(asset.s3_key)
        result.append(item)
    return result
