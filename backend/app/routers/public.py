"""API pública (sin autenticación): sitio web, flujo de agendamiento y
la Fila en vivo (tablero de turnos del día).

Prefijo: /api/v1/public/{tenant_slug}
Los endpoints de escritura llevan rate limiting por IP.
"""
from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db, utcnow
from ..deps import (
    booking_rate_limiter,
    client_ip,
    get_tenant_by_slug,
    lookup_rate_limiter,
    payment_rate_limiter,
    read_rate_limiter,
    webhook_rate_limiter,
)
from ..models import (
    ACTIVE_STATUSES,
    Appointment,
    GiftCode,
    MediaAsset,
    Payment,
    Product,
    Review,
    Service,
    Tenant,
    TimeOff,
)
from ..schemas import (
    AppointmentFind,
    AppointmentPublic,
    AvailabilityQuery,
    BookingCreate,
    CancelRequest,
    DayAvailability,
    GiftCheckoutCreate,
    GroupBookingCreate,
    MediaAssetOut,
    PortalRequest,
    ProductPublic,
    ProfessionalPublic,
    RebookRequest,
    ReviewCreate,
    ReviewPublic,
    ServicePublic,
    SimulatePaymentRequest,
    TenantPublic,
)
from ..services import appointments as booking
from ..services import clients as clients_service
from ..services import notifications
from ..services import payments as payments_service
from ..services import security as security_guard
from ..services.availability import compute_slots
from ..services.professional import get_professional
from ..services.storage import get_storage
from .common import appointment_to_public, professional_to_public

router = APIRouter(prefix="/api/v1/public/{tenant_slug}", tags=["public"])

def _handle_booking_error(exc: booking.BookingError) -> HTTPException:
    return HTTPException(exc.status_code, {"code": exc.code, "message": exc.detail})

def _reject_bots(db: Session, tenant: Tenant, request: Request, *,
                 website: str | None, captcha_token: str | None, form: str) -> None:
    """Honeypot + Turnstile en formularios públicos de escritura.

    El honeypot responde con el mismo error genérico que cualquier validación
    para no revelarle al bot que fue detectado."""
    ip = client_ip(request)
    if website:
        security_guard.log_event(db, kind="honeypot", tenant_id=tenant.id, ip=ip,
                                 detail={"form": form})
        raise HTTPException(400, {"code": "invalid",
                                  "message": "No se pudo procesar la solicitud."})
    if not security_guard.verify_turnstile(captcha_token, ip):
        security_guard.log_event(db, kind="captcha_failed", tenant_id=tenant.id, ip=ip,
                                 detail={"form": form})
        raise HTTPException(403, {"code": "captcha",
                                  "message": "Verificación anti-bot fallida. "
                                             "Recarga la página e intenta de nuevo."})

@router.get("", response_model=TenantPublic, dependencies=[Depends(read_rate_limiter)])
def tenant_info(tenant: Tenant = Depends(get_tenant_by_slug)):
    return tenant

@router.get("/professional", response_model=ProfessionalPublic,
            dependencies=[Depends(read_rate_limiter)])
def professional_profile(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    """Will: su nombre, su titular, su foto y su horario."""
    return professional_to_public(get_professional(db, tenant))

@router.get("/services", response_model=list[ServicePublic],
            dependencies=[Depends(read_rate_limiter)])
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

@router.get("/time-off", dependencies=[Depends(read_rate_limiter)])
def time_off(
    start: date,
    end: date,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Fechas de descanso puntual (excepciones) para pintar el calendario."""
    rows = db.scalars(
        select(TimeOff).where(
            TimeOff.tenant_id == tenant.id,
            TimeOff.date >= start,
            TimeOff.date <= end,
        )
    )
    return {"dates": [r.date.isoformat() for r in rows]}

@router.post("/availability", response_model=DayAvailability,
             dependencies=[Depends(read_rate_limiter)])
def availability(
    query: AvailabilityQuery,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    booking.release_unconfirmed(db, tenant)  # libera huecos vencidos antes de mostrar
    payments_service.expire_stale_deposits(db, tenant)
    notifications.send_pending_reminders(db, tenant)  # mismo patrón sin cron
    professional = get_professional(db, tenant)
    try:
        services = booking.load_services(db, tenant, query.service_ids)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    duration = sum(s.duration_min for s in services) * query.party
    is_day_off, slots = compute_slots(db, tenant, professional, query.date, duration)
    return DayAvailability(date=query.date, is_day_off=is_day_off, slots=slots)

@router.post(
    "/appointments",
    response_model=AppointmentPublic,
    status_code=201,
    dependencies=[Depends(booking_rate_limiter)],
)
def create_booking(
    data: BookingCreate,
    request: Request,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    # El código de gestión devuelto aquí es el ÚNICO canal de gestión del
    # cliente (ADR-009): el frontend lo muestra de forma prominente.
    _reject_bots(db, tenant, request, website=data.website,
                 captcha_token=data.captcha_token, form="booking")
    booking.release_unconfirmed(db, tenant)
    payments_service.expire_stale_deposits(db, tenant)
    deposit = payments_service.deposit_config(tenant)
    try:
        appointment = booking.create_appointment(
            db, tenant, data,
            # Con anticipo activado la reserva nace pendiente y el hueco queda
            # tomado; se confirma al aprobarse el pago (o se libera al vencer).
            status="pendiente" if deposit["enabled"] else "confirmado",
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    security_guard.note_public_booking(
        db, tenant, ip=client_ip(request), phone=appointment.customer_whatsapp
    )
    if deposit["enabled"]:
        payments_service.create_deposit_payment(db, tenant, appointment)
        db.refresh(appointment)
    else:
        # Sin anticipo el turno nace confirmado → copia de cortesía inmediata.
        # (Con anticipo, el correo sale al aprobarse el pago: ver apply_result.)
        notifications.send_booking_confirmation(db, tenant, appointment)
    return appointment_to_public(appointment, tenant)

def _load_by_code(db: Session, tenant: Tenant, manage_code: str) -> Appointment:
    appointment = db.scalar(
        select(Appointment)
        .options(selectinload(Appointment.services), selectinload(Appointment.professional))
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.manage_code == manage_code.strip().upper(),
        )
    )
    if appointment is None:
        raise HTTPException(404, "Turno no encontrado. Verifica el código.")
    return appointment

@router.get("/appointments/{manage_code}", response_model=AppointmentPublic,
            dependencies=[Depends(lookup_rate_limiter)])
def get_appointment(
    manage_code: str,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    # El límite por IP en las consultas por código es lo que hace inviable
    # enumerar códigos de gestión (31^8 combinaciones a 30 intentos/minuto).
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

# ------------------------------------------------------------- pagos

def _payment_status_payload(db: Session, tenant: Tenant, payment: Payment) -> dict:
    payable = payment.status in ("pendiente", "rechazado")
    gift_code = None
    if payment.gift_code_id:
        gift = db.get(GiftCode, payment.gift_code_id)
        gift_code = gift.code if gift else None
    appointment_code = None
    appointment_status = None
    if payment.appointment_id:
        appointment = db.get(Appointment, payment.appointment_id)
        if appointment:
            appointment_code = appointment.manage_code
            appointment_status = appointment.status
    return {
        "reference": payment.reference,
        "kind": payment.kind,
        "status": payment.status,
        "amount_cop": payment.amount_cop,
        "payment_method": payment.payment_method,
        "checkout_url": payments_service.checkout_url(payment) if payable else None,
        "gift_code": gift_code,
        "gift_description": (payment.detail or {}).get("gift_description"),
        "appointment_code": appointment_code,
        "appointment_status": appointment_status,
    }

def _load_payment(db: Session, tenant: Tenant, reference: str) -> Payment:
    payment = db.scalar(
        select(Payment).where(
            Payment.tenant_id == tenant.id, Payment.reference == reference.strip()
        )
    )
    if payment is None:
        raise HTTPException(404, "Pago no encontrado")
    return payment

@router.post("/gifts/checkout", dependencies=[Depends(payment_rate_limiter)])
def gift_checkout(
    data: GiftCheckoutCreate,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Regala un corte: se paga en línea y el código sale al instante.
    Inicio de transacción de pago → límite estricto (5 / 15 min)."""
    if not payments_service.gift_shop_enabled(tenant):
        raise HTTPException(404, "La tienda de regalos no está habilitada")
    try:
        services = booking.load_services(db, tenant, [data.service_id])
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    service = services[0]
    payment = payments_service.create_gift_payment(
        db,
        tenant,
        amount_cop=service.price_cop,
        description=f"{service.name} de regalo",
        payer_name=data.payer_name,
        payer_whatsapp=data.payer_whatsapp,
        payer_email=data.payer_email,
    )
    return _payment_status_payload(db, tenant, payment)

@router.get("/payments/{reference}", dependencies=[Depends(lookup_rate_limiter)])
def payment_status(
    reference: str,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    payment = _load_payment(db, tenant, reference)
    return _payment_status_payload(db, tenant, payment)

@router.post(
    "/payments/{reference}/simulate",
    dependencies=[Depends(booking_rate_limiter)],
)
def simulate_payment(
    reference: str,
    data: SimulatePaymentRequest,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """SOLO en modo simulador (sin llaves de Wompi): aprueba o rechaza el pago
    para demostrar el flujo completo. En sandbox/producción no existe."""
    from ..config import get_settings

    if get_settings().wompi_mode != "mock":
        raise HTTPException(404, "No disponible fuera del modo simulador")
    payment = _load_payment(db, tenant, reference)
    payment = payments_service.apply_result(
        db,
        payment,
        status="aprobado" if data.approve else "rechazado",
        method="SIMULADO",
        transaction_id=f"mock-{payment.reference}",
    )
    return _payment_status_payload(db, tenant, payment)

@router.post("/payments/wompi/webhook", dependencies=[Depends(webhook_rate_limiter)])
def wompi_webhook(
    event: dict,
    request: Request,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Webhook de eventos de Wompi (transaction.updated), verificado por
    checksum SHA256 con el events secret. NUNCA se marca un pago como aprobado
    por lo que diga el navegador del cliente: solo por este canal."""
    try:
        payments_service.handle_wompi_event(db, tenant, event, ip=client_ip(request))
    except payments_service.PaymentError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None
    return {"ok": True}

# ------------------------------------------------------------- tanda 4

@router.post(
    "/appointments/group",
    status_code=201,
    dependencies=[Depends(booking_rate_limiter)],
)
def create_group_booking(
    data: GroupBookingCreate,
    request: Request,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Reserva grupal: turnos seguidos con el mismo barbero, todo o nada."""
    _reject_bots(db, tenant, request, website=data.website,
                 captcha_token=data.captcha_token, form="group_booking")
    booking.release_unconfirmed(db, tenant)
    try:
        created = booking.create_group_appointment(db, tenant, data)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    security_guard.note_public_booking(
        db, tenant, ip=client_ip(request), phone=data.customer_whatsapp
    )
    return {"appointments": [appointment_to_public(a, tenant) for a in created]}

@router.post(
    "/appointments/{manage_code}/rebook",
    response_model=AppointmentPublic,
    status_code=201,
    dependencies=[Depends(booking_rate_limiter)],
)
def rebook(
    manage_code: str,
    data: RebookRequest,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Repetir turno: mismo barbero, misma hora y servicios, N semanas después."""
    appointment = _load_by_code(db, tenant, manage_code)
    try:
        new_appointment = booking.rebook_appointment(db, tenant, appointment, data.weeks)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    return appointment_to_public(new_appointment, tenant)

@router.get("/products", response_model=list[ProductPublic],
            dependencies=[Depends(read_rate_limiter)])
def list_products(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    """La vitrina: solo consulta — los productos se compran en el local."""
    storage = get_storage()
    result = []
    for product in db.scalars(
        select(Product)
        .where(Product.tenant_id == tenant.id, Product.is_active.is_(True))
        .order_by(Product.sort_order, Product.id)
    ):
        item = ProductPublic.model_validate(product)
        item.photo_url = storage.public_url(product.photo_key) if product.photo_key else None
        result.append(item)
    return result

@router.get("/trayectoria", dependencies=[Depends(read_rate_limiter)])
def trayectoria(
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Las cifras que respaldan a Will: calificación, cortes hechos y su trabajo."""
    from sqlalchemy import func

    rating_row = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.tenant_id == tenant.id,
            Review.is_public.is_(True),
        )
    ).one()
    completed = db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.tenant_id == tenant.id, Appointment.status == "completado"
        )
    ) or 0
    storage = get_storage()
    cuts = db.scalars(
        select(MediaAsset)
        .where(MediaAsset.tenant_id == tenant.id, MediaAsset.kind == "cut")
        .order_by(MediaAsset.sort_order, MediaAsset.id.desc())
        .limit(12)
    )
    return {
        "rating": round(float(rating_row[0]), 1) if rating_row[0] else None,
        "review_count": rating_row[1],
        "completed_count": completed,
        "cuts": [storage.public_url(c.s3_key) for c in cuts],
    }

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
            selectinload(Appointment.professional),
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
        # Tanda 4: código de referido propio — se crea la primera vez que entra
        "referral_code": clients_service.get_or_create_referral_code(
            db, tenant, data.customer_whatsapp
        ),
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
        professional_id=appointment.professional_id,
        customer_whatsapp=appointment.customer_whatsapp,
        customer_name=appointment.customer_name,
        rating=data.rating,
        comment=(data.comment or "").strip() or None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_to_public(review, tenant)

@router.get("/reviews", dependencies=[Depends(read_rate_limiter)])
def list_reviews(
    limit: int = 12,
    tenant: Tenant = Depends(get_tenant_by_slug),
    db: Session = Depends(get_db),
):
    """Reseñas públicas recientes y el promedio general."""
    from sqlalchemy import func

    average, total = db.execute(
        select(func.avg(Review.rating), func.count(Review.id))
        .where(Review.tenant_id == tenant.id, Review.is_public.is_(True))
    ).one()

    reviews = db.scalars(
        select(Review)
        .where(Review.tenant_id == tenant.id, Review.is_public.is_(True))
        .order_by(Review.id.desc())
        .limit(min(limit, 30))
    )
    return {
        "overall": {
            "average": round(float(average), 1) if average else None,
            "count": total,
        },
        "items": [_review_to_public(r, tenant) for r in reviews],
    }

# ---------------------------------------------------------------- La Fila

def _weekday_key(day: date) -> str:
    return ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day.weekday()]

@router.get("/queue", dependencies=[Depends(read_rate_limiter)])
def today_queue(
    tenant: Tenant = Depends(get_tenant_by_slug), db: Session = Depends(get_db)
):
    """La Fila en vivo: estado de los turnos de HOY.

    Pensado para el tablero público (/hoy) y la pantalla del local.
    Privacidad: solo números de turno, horas y estados — nunca nombres
    ni teléfonos de clientes.
    """
    from ..services.appointments import local_day_bounds
    from ..services.availability import is_time_off

    booking.release_unconfirmed(db, tenant)
    payments_service.expire_stale_deposits(db, tenant)
    notifications.send_pending_reminders(db, tenant)

    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    day_start, day_end = local_day_bounds(tenant, today)
    professional = get_professional(db, tenant)

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

    current = next((a for a in appointments if a.status == "en_curso"), None)
    waiting = [
        a for a in appointments
        if a.status in ("pendiente", "confirmado") and a.ends_at > now
    ]
    done = [a for a in appointments if a.status == "completado"]
    is_off = (professional.schedule or {}).get(_weekday_key(today)) is None or is_time_off(
        db, professional.id, today
    )

    return {
        "date_local": today.isoformat(),
        "now_local": now.astimezone(tz).strftime("%H:%M"),
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

@router.get("/appointments/{manage_code}/queue",
            dependencies=[Depends(lookup_rate_limiter)])
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
        "time_local": appointment.starts_at.astimezone(tz).strftime("%H:%M"),
        "ahead_count": len(ahead_list) if appointment.status in ACTIVE_STATUSES else 0,
        "now_serving": now_serving,
    }

@router.get("/media", response_model=list[MediaAssetOut],
            dependencies=[Depends(read_rate_limiter)])
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
