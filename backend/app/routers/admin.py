"""Panel de administración. Roles:
- admin: acceso total al tenant.
- barbero: solo lectura/gestión de su propia agenda del día.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db, utcnow
from ..deps import get_current_user, get_user_tenant, require_admin
from ..models import (
    ACTIVE_STATUSES,
    AdminUser,
    Appointment,
    AuditLog,
    Barber,
    BarberTimeOff,
    MediaAsset,
    Service,
    Tenant,
)
from ..schemas import (
    AppointmentAdmin,
    BarberAdmin,
    BarberCreate,
    BarberUpdate,
    CancelRequest,
    ManualBookingCreate,
    MediaAssetOut,
    PresignRequest,
    RescheduleRequest,
    ServiceAdmin,
    ServiceCreate,
    ServiceUpdate,
    StatusUpdate,
    TimeOffCreate,
    TimeOffOut,
)
from ..services import appointments as booking
from ..services import audit
from ..services.storage import ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, get_storage, make_key
from .common import appointment_to_admin, barber_photo_url

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _handle_booking_error(exc: booking.BookingError) -> HTTPException:
    return HTTPException(exc.status_code, {"code": exc.code, "message": exc.detail})


def _appointment_query():
    return select(Appointment).options(
        selectinload(Appointment.services), selectinload(Appointment.barber)
    )


def _get_appointment(db: Session, tenant: Tenant, appointment_id: int) -> Appointment:
    appointment = db.scalar(
        _appointment_query().where(
            Appointment.id == appointment_id, Appointment.tenant_id == tenant.id
        )
    )
    if appointment is None:
        raise HTTPException(404, "Turno no encontrado")
    return appointment


# ------------------------------------------------------------------ dashboard

@router.get("/dashboard")
def dashboard(
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Turnos de HOY por barbero: turno en curso, próximos, completados."""
    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    day_start, day_end = booking.local_day_bounds(tenant, today)

    barbers_query = select(Barber).where(
        Barber.tenant_id == tenant.id, Barber.is_active.is_(True)
    )
    if user.role == "barbero":
        barbers_query = barbers_query.where(Barber.id == user.barber_id)
    barbers = list(db.scalars(barbers_query.order_by(Barber.sort_order, Barber.id)))

    appointments = list(
        db.scalars(
            _appointment_query()
            .where(
                Appointment.tenant_id == tenant.id,
                Appointment.starts_at >= day_start,
                Appointment.starts_at < day_end,
            )
            .order_by(Appointment.starts_at)
        )
    )

    result = []
    for barber in barbers:
        own = [a for a in appointments if a.barber_id == barber.id]
        current = next(
            (
                a for a in own
                if a.status == "en_curso"
                or (a.status == "confirmado" and a.starts_at <= now < a.ends_at)
            ),
            None,
        )
        upcoming = [a for a in own if a.status in ACTIVE_STATUSES and a.starts_at > now]
        is_day_off = (barber.schedule or {}).get(
            ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[today.weekday()]
        ) is None
        result.append(
            {
                "barber": {"id": barber.id, "name": barber.name,
                           "photo_url": barber_photo_url(barber)},
                "is_day_off": is_day_off,
                "current": appointment_to_admin(current, tenant) if current else None,
                "upcoming": [appointment_to_admin(a, tenant) for a in upcoming],
                "all_today": [appointment_to_admin(a, tenant) for a in own],
                "done_count": sum(1 for a in own if a.status == "completado"),
                "cancelled_count": sum(1 for a in own if a.status in ("cancelado", "no_show")),
            }
        )
    return {"date_local": today.isoformat(), "barbers": result}


# ------------------------------------------------------------------ agenda

@router.get("/agenda")
def agenda(
    start: date,
    end: date,
    barber_id: int | None = None,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Vista calendario por rango, incluyendo días de descanso del barbero."""
    if user.role == "barbero":
        barber_id = user.barber_id  # un barbero solo ve su propia agenda
    if (end - start).days > 62:
        raise HTTPException(400, "Rango máximo: 62 días")

    range_start, _ = booking.local_day_bounds(tenant, start)
    _, range_end = booking.local_day_bounds(tenant, end)

    query = (
        _appointment_query()
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.starts_at >= range_start,
            Appointment.starts_at < range_end,
        )
        .order_by(Appointment.starts_at)
    )
    if barber_id:
        query = query.where(Appointment.barber_id == barber_id)
    appointments = [appointment_to_admin(a, tenant) for a in db.scalars(query)]

    barbers_query = select(Barber).where(Barber.tenant_id == tenant.id, Barber.is_active.is_(True))
    if barber_id:
        barbers_query = barbers_query.where(Barber.id == barber_id)
    barbers = list(db.scalars(barbers_query))

    time_off_query = select(BarberTimeOff).where(
        BarberTimeOff.tenant_id == tenant.id,
        BarberTimeOff.date >= start,
        BarberTimeOff.date <= end,
    )
    if barber_id:
        time_off_query = time_off_query.where(BarberTimeOff.barber_id == barber_id)

    return {
        "appointments": appointments,
        "barbers": [
            {"id": b.id, "name": b.name, "schedule": b.schedule} for b in barbers
        ],
        "time_off": [
            {"id": t.id, "barber_id": t.barber_id, "date": t.date.isoformat(),
             "reason": t.reason}
            for t in db.scalars(time_off_query)
        ],
    }


# ------------------------------------------------------------------ turnos

@router.get("/appointments", response_model=list[AppointmentAdmin])
def list_appointments(
    status: str | None = None,
    barber_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Historial con filtros (completados, cancelados, no-show...)."""
    if user.role == "barbero":
        barber_id = user.barber_id
    query = _appointment_query().where(Appointment.tenant_id == tenant.id)
    if status:
        query = query.where(Appointment.status == status)
    if barber_id:
        query = query.where(Appointment.barber_id == barber_id)
    if date_from:
        query = query.where(Appointment.starts_at >= booking.local_day_bounds(tenant, date_from)[0])
    if date_to:
        query = query.where(Appointment.starts_at < booking.local_day_bounds(tenant, date_to)[1])
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            Appointment.customer_name.ilike(pattern)
            | Appointment.customer_whatsapp.like(pattern)
            | (Appointment.manage_code == q.strip().upper())
        )
    query = query.order_by(Appointment.starts_at.desc()).limit(min(limit, 200)).offset(offset)
    return [appointment_to_admin(a, tenant) for a in db.scalars(query)]


@router.post("/appointments", response_model=AppointmentAdmin, status_code=201)
def create_manual(
    data: ManualBookingCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Reserva manual (telefónica/presencial): sin antelación mínima."""
    try:
        appointment = booking.create_appointment(
            db, tenant, data, enforce_lead=False, notes=data.notes
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, "appointment.create_manual", "appointment", appointment.id,
                 {"customer": data.customer_name, "date": str(data.date), "time": data.time})
    db.commit()
    return appointment_to_admin(appointment, tenant)


@router.patch("/appointments/{appointment_id}/reschedule", response_model=AppointmentAdmin)
def reschedule(
    appointment_id: int,
    data: RescheduleRequest,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    appointment = _get_appointment(db, tenant, appointment_id)
    old = {"date": appointment.starts_at.isoformat(), "barber_id": appointment.barber_id}
    try:
        appointment = booking.reschedule_appointment(
            db, tenant, appointment,
            new_barber_id=data.barber_id, new_date=data.date, new_time=data.time,
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, "appointment.reschedule", "appointment", appointment.id,
                 {"from": old, "to": {"date": str(data.date), "time": data.time,
                                      "barber_id": appointment.barber_id}})
    db.commit()
    return appointment_to_admin(appointment, tenant)


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentAdmin)
def cancel(
    appointment_id: int,
    data: CancelRequest,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    appointment = _get_appointment(db, tenant, appointment_id)
    try:
        appointment = booking.cancel_appointment(db, appointment, reason=data.reason,
                                                 by_admin=True)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, "appointment.cancel", "appointment", appointment.id,
                 {"reason": data.reason})
    db.commit()
    return appointment_to_admin(appointment, tenant)


@router.patch("/appointments/{appointment_id}/status", response_model=AppointmentAdmin)
def update_status(
    appointment_id: int,
    data: StatusUpdate,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Cambio de estado (en_curso, completado, no_show...). Un barbero solo
    puede operar sobre sus propios turnos."""
    appointment = _get_appointment(db, tenant, appointment_id)
    if user.role == "barbero" and appointment.barber_id != user.barber_id:
        raise HTTPException(403, "Solo puedes gestionar tus propios turnos")
    try:
        appointment = booking.transition_status(db, appointment, data.status)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, f"appointment.status.{data.status}", "appointment", appointment.id)
    db.commit()
    return appointment_to_admin(appointment, tenant)


# ------------------------------------------------------------------ barberos

@router.get("/barbers", response_model=list[BarberAdmin])
def list_barbers(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    result = []
    for barber in db.scalars(
        select(Barber).where(Barber.tenant_id == tenant.id).order_by(Barber.sort_order, Barber.id)
    ):
        item = BarberAdmin.model_validate(barber)
        item.photo_url = barber_photo_url(barber)
        result.append(item)
    return result


@router.post("/barbers", response_model=BarberAdmin, status_code=201)
def create_barber(
    data: BarberCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    barber = Barber(tenant_id=tenant.id, **data.model_dump())
    db.add(barber)
    db.flush()
    audit.record(db, user, "barber.create", "barber", barber.id, {"name": barber.name})
    db.commit()
    db.refresh(barber)
    return BarberAdmin.model_validate(barber)


@router.patch("/barbers/{barber_id}", response_model=BarberAdmin)
def update_barber(
    barber_id: int,
    data: BarberUpdate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    barber = db.scalar(
        select(Barber).where(Barber.id == barber_id, Barber.tenant_id == tenant.id)
    )
    if barber is None:
        raise HTTPException(404, "Barbero no encontrado")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(barber, field, value)
    audit.record(db, user, "barber.update", "barber", barber.id, changes)
    db.commit()
    db.refresh(barber)
    item = BarberAdmin.model_validate(barber)
    item.photo_url = barber_photo_url(barber)
    return item


@router.get("/barbers/{barber_id}/time-off", response_model=list[TimeOffOut])
def list_time_off(
    barber_id: int,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(BarberTimeOff)
            .where(BarberTimeOff.tenant_id == tenant.id, BarberTimeOff.barber_id == barber_id)
            .order_by(BarberTimeOff.date)
        )
    )


@router.post("/barbers/{barber_id}/time-off", response_model=TimeOffOut, status_code=201)
def create_time_off(
    barber_id: int,
    data: TimeOffCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    barber = db.scalar(
        select(Barber).where(Barber.id == barber_id, Barber.tenant_id == tenant.id)
    )
    if barber is None:
        raise HTTPException(404, "Barbero no encontrado")
    existing = db.scalar(
        select(BarberTimeOff).where(
            BarberTimeOff.barber_id == barber_id, BarberTimeOff.date == data.date
        )
    )
    if existing:
        raise HTTPException(409, "Ya existe un descanso registrado para esa fecha")
    time_off = BarberTimeOff(
        tenant_id=tenant.id, barber_id=barber_id, date=data.date, reason=data.reason
    )
    db.add(time_off)
    db.flush()
    audit.record(db, user, "barber.time_off.create", "barber_time_off", time_off.id,
                 {"barber_id": barber_id, "date": str(data.date)})
    db.commit()
    db.refresh(time_off)
    return time_off


@router.delete("/time-off/{time_off_id}", status_code=204)
def delete_time_off(
    time_off_id: int,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    time_off = db.scalar(
        select(BarberTimeOff).where(
            BarberTimeOff.id == time_off_id, BarberTimeOff.tenant_id == tenant.id
        )
    )
    if time_off is None:
        raise HTTPException(404, "Registro no encontrado")
    audit.record(db, user, "barber.time_off.delete", "barber_time_off", time_off_id,
                 {"barber_id": time_off.barber_id, "date": str(time_off.date)})
    db.delete(time_off)
    db.commit()


# ------------------------------------------------------------------ servicios

@router.get("/services", response_model=list[ServiceAdmin])
def list_services(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(Service).where(Service.tenant_id == tenant.id)
            .order_by(Service.sort_order, Service.id)
        )
    )


@router.post("/services", response_model=ServiceAdmin, status_code=201)
def create_service(
    data: ServiceCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    service = Service(tenant_id=tenant.id, **data.model_dump())
    db.add(service)
    db.flush()
    audit.record(db, user, "service.create", "service", service.id, data.model_dump())
    db.commit()
    db.refresh(service)
    return service


@router.patch("/services/{service_id}", response_model=ServiceAdmin)
def update_service(
    service_id: int,
    data: ServiceUpdate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    service = db.scalar(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant.id)
    )
    if service is None:
        raise HTTPException(404, "Servicio no encontrado")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(service, field, value)
    audit.record(db, user, "service.update", "service", service.id, changes)
    db.commit()
    db.refresh(service)
    return service


# ------------------------------------------------------------------ galería

@router.get("/media", response_model=list[MediaAssetOut])
def list_media(
    kind: str | None = None,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
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


@router.post("/media/presign")
def presign_upload(
    data: PresignRequest,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
):
    """Contrato unificado de subida:
    - mode=presigned (S3): el navegador hace POST directo a S3 con `upload`.
    - mode=direct (local): el navegador hace POST multipart a /media/upload.
    """
    storage = get_storage()
    key = make_key(tenant.slug, data.kind, data.content_type)
    if storage.upload_mode == "presigned":
        return {"mode": "presigned", "key": key, "upload": storage.presign_post(
            key, data.content_type)}
    return {"mode": "direct", "key": key, "upload": {"url": "/api/v1/admin/media/upload"}}


@router.post("/media/upload", response_model=MediaAssetOut, status_code=201)
async def upload_direct(
    kind: str = Form(...),
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Subida directa (solo backend de almacenamiento local / desarrollo)."""
    storage = get_storage()
    if storage.upload_mode != "direct":
        raise HTTPException(400, "En producción usa /media/presign (subida directa a S3)")
    if kind not in ("gallery", "barber", "cut"):
        raise HTTPException(400, "kind inválido")
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(415, "Formato no soportado (jpeg/png/webp/avif)")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Imagen demasiado grande (máx. 10 MB)")
    key = make_key(tenant.slug, kind, file.content_type)
    storage.save(key, content)
    asset = MediaAsset(tenant_id=tenant.id, kind=kind, s3_key=key,
                       title=file.filename)
    db.add(asset)
    db.flush()
    audit.record(db, user, "media.upload", "media_asset", asset.id, {"key": key, "kind": kind})
    db.commit()
    db.refresh(asset)
    item = MediaAssetOut.model_validate(asset)
    item.url = storage.public_url(key)
    return item


@router.post("/media/confirm", response_model=MediaAssetOut, status_code=201)
def confirm_upload(
    data: dict,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Tras subir a S3 con la URL pre-firmada, registra el asset en DB."""
    key, kind = data.get("key", ""), data.get("kind", "")
    if kind not in ("gallery", "barber", "cut") or not key.startswith(f"tenants/{tenant.slug}/"):
        raise HTTPException(400, "key o kind inválidos")
    storage = get_storage()
    if storage.upload_mode == "presigned" and not storage.exists(key):
        raise HTTPException(400, "El archivo no existe en S3 (¿la subida falló?)")
    asset = MediaAsset(tenant_id=tenant.id, kind=kind, s3_key=key, title=data.get("title"))
    db.add(asset)
    db.flush()
    audit.record(db, user, "media.confirm", "media_asset", asset.id, {"key": key})
    db.commit()
    db.refresh(asset)
    item = MediaAssetOut.model_validate(asset)
    item.url = storage.public_url(key)
    return item


@router.delete("/media/{asset_id}", status_code=204)
def delete_media(
    asset_id: int,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.tenant_id == tenant.id)
    )
    if asset is None:
        raise HTTPException(404, "Imagen no encontrada")
    try:
        get_storage().delete(asset.s3_key)
    except Exception:
        pass  # la fila se elimina igual; huérfanos en storage no son críticos
    audit.record(db, user, "media.delete", "media_asset", asset_id, {"key": asset.s3_key})
    db.delete(asset)
    db.commit()


# ------------------------------------------------------------------ auditoría

@router.get("/audit-log")
def list_audit(
    limit: int = 100,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(AuditLog).where(AuditLog.tenant_id == tenant.id)
        .order_by(AuditLog.id.desc()).limit(min(limit, 200))
    )
    return [
        {
            "id": r.id, "actor": r.actor_username, "action": r.action,
            "entity": r.entity, "entity_id": r.entity_id, "payload": r.payload,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
