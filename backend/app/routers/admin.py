"""Panel de administración de Will: su agenda, sus clientes y su desempeño."""
from __future__ import annotations

from datetime import date, timedelta
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
    ClientNote,
    GiftCode,
    MediaAsset,
    Product,
    Service,
    Tenant,
    TimeOff,
)
from ..schemas import (
    AppointmentAdmin,
    CancelRequest,
    ClientNoteCreate,
    ClientNoteOut,
    GiftCodeCreate,
    GiftCodeOut,
    ManualBookingCreate,
    MediaAssetOut,
    PresignRequest,
    ProductAdmin,
    ProductCreate,
    ProductUpdate,
    ProfessionalAdmin,
    ProfessionalUpdate,
    RescheduleRequest,
    ServiceAdmin,
    ServiceCreate,
    ServiceUpdate,
    StatusUpdate,
    TimeOffCreate,
    TimeOffOut,
    WalkInCreate,
    normalize_phone,
)
from ..services import appointments as booking
from ..services import audit
from ..services import clients as clients_service
from ..services.professional import get_professional
from ..services.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_UPLOAD_BYTES,
    get_storage,
    make_key,
    sniff_image_content_type,
)
from .common import appointment_to_admin, professional_photo_url

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _handle_booking_error(exc: booking.BookingError) -> HTTPException:
    return HTTPException(exc.status_code, {"code": exc.code, "message": exc.detail})


def _appointment_query():
    return select(Appointment).options(
        selectinload(Appointment.services), selectinload(Appointment.professional)
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
    """Los turnos de HOY: el que está en la silla, los que siguen, los cerrados."""
    from ..services import notifications

    booking.release_unconfirmed(db, tenant)  # el dashboard siempre al día
    notifications.send_pending_reminders(db, tenant)
    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    day_start, day_end = booking.local_day_bounds(tenant, today)
    professional = get_professional(db, tenant)

    today_appointments = list(
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

    current = next(
        (
            a for a in today_appointments
            if a.status == "en_curso"
            or (a.status == "confirmado" and a.starts_at <= now < a.ends_at)
        ),
        None,
    )
    upcoming = [
        a for a in today_appointments if a.status in ACTIVE_STATUSES and a.starts_at > now
    ]
    is_day_off = (professional.schedule or {}).get(
        ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[today.weekday()]
    ) is None

    return {
        "date_local": today.isoformat(),
        "is_day_off": is_day_off,
        "current": appointment_to_admin(current, tenant) if current else None,
        "upcoming": [appointment_to_admin(a, tenant) for a in upcoming],
        "all_today": [appointment_to_admin(a, tenant) for a in today_appointments],
        "done_count": sum(1 for a in today_appointments if a.status == "completado"),
        "cancelled_count": sum(
            1 for a in today_appointments if a.status in ("cancelado", "no_show")
        ),
    }


# ------------------------------------------------------------------ agenda

@router.get("/agenda")
def agenda(
    start: date,
    end: date,
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Vista calendario por rango, incluyendo los días de descanso."""
    if (end - start).days > 62:
        raise HTTPException(400, "Rango máximo: 62 días")

    range_start, _ = booking.local_day_bounds(tenant, start)
    _, range_end = booking.local_day_bounds(tenant, end)

    appointments = [
        appointment_to_admin(a, tenant)
        for a in db.scalars(
            _appointment_query()
            .where(
                Appointment.tenant_id == tenant.id,
                Appointment.starts_at >= range_start,
                Appointment.starts_at < range_end,
            )
            .order_by(Appointment.starts_at)
        )
    ]

    time_off = db.scalars(
        select(TimeOff).where(
            TimeOff.tenant_id == tenant.id,
            TimeOff.date >= start,
            TimeOff.date <= end,
        )
    )

    return {
        "appointments": appointments,
        "schedule": get_professional(db, tenant).schedule,
        "time_off": [
            {"id": t.id, "date": t.date.isoformat(), "reason": t.reason} for t in time_off
        ],
    }


# ------------------------------------------------------------------ turnos

@router.get("/appointments", response_model=list[AppointmentAdmin])
def list_appointments(
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Historial con filtros (completados, cancelados, no-show...)."""
    query = _appointment_query().where(Appointment.tenant_id == tenant.id)
    if status:
        query = query.where(Appointment.status == status)
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


@router.post("/appointments/walk-in", response_model=AppointmentAdmin, status_code=201)
def create_walk_in(
    data: WalkInCreate,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Walk-in (Tanda 2): cliente en el local sin cita — toma el próximo hueco
    de HOY y entra a La Fila."""
    try:
        appointment = booking.create_walk_in(
            db,
            tenant,
            service_ids=data.service_ids,
            customer_name=data.customer_name,
            customer_whatsapp=data.customer_whatsapp,
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, "appointment.walk_in", "appointment", appointment.id,
                 {"customer": data.customer_name})
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
    old = {"date": appointment.starts_at.isoformat()}
    try:
        appointment = booking.reschedule_appointment(
            db, tenant, appointment, new_date=data.date, new_time=data.time,
        )
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, "appointment.reschedule", "appointment", appointment.id,
                 {"from": old, "to": {"date": str(data.date), "time": data.time}})
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
    """Cambio de estado (en_curso, completado, no_show...)."""
    appointment = _get_appointment(db, tenant, appointment_id)
    try:
        appointment = booking.transition_status(db, appointment, data.status)
    except booking.BookingError as exc:
        raise _handle_booking_error(exc) from None
    audit.record(db, user, f"appointment.status.{data.status}", "appointment", appointment.id)
    db.commit()
    return appointment_to_admin(appointment, tenant)


# ------------------------------------------------------------------ clientes

def _normalized_phone_or_400(phone: str) -> str:
    try:
        return normalize_phone(phone)
    except ValueError:
        raise HTTPException(400, "Teléfono inválido") from None


@router.get("/clients/{phone}")
def client_profile(
    phone: str,
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Perfil del cliente por teléfono: historial, fidelidad y notas de estilo."""
    normalized = _normalized_phone_or_400(phone)
    recent = db.scalars(
        _appointment_query()
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.customer_whatsapp == normalized,
        )
        .order_by(Appointment.starts_at.desc())
        .limit(10)
    )
    return {
        "phone": normalized,
        "stats": clients_service.client_stats(db, tenant, normalized),
        "loyalty": clients_service.loyalty_status(db, tenant, normalized),
        "notes": [
            ClientNoteOut.model_validate(n)
            for n in clients_service.client_notes(db, tenant, normalized)
        ],
        "recent": [appointment_to_admin(a, tenant) for a in recent],
    }


@router.post("/clients/{phone}/notes", response_model=ClientNoteOut, status_code=201)
def add_client_note(
    phone: str,
    data: ClientNoteCreate,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    normalized = _normalized_phone_or_400(phone)
    note = ClientNote(
        tenant_id=tenant.id,
        customer_whatsapp=normalized,
        author_user_id=user.id,
        author_name=user.username,
        note=data.note.strip(),
    )
    db.add(note)
    db.flush()
    audit.record(db, user, "client.note.create", "client_note", note.id,
                 {"phone": normalized})
    db.commit()
    db.refresh(note)
    return note


@router.delete("/client-notes/{note_id}", status_code=204)
def delete_client_note(
    note_id: int,
    user: AdminUser = Depends(get_current_user),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    note = db.scalar(
        select(ClientNote).where(
            ClientNote.id == note_id, ClientNote.tenant_id == tenant.id
        )
    )
    if note is None:
        raise HTTPException(404, "Nota no encontrada")
    if user.role != "admin" and note.author_user_id != user.id:
        raise HTTPException(403, "Solo el autor o el admin pueden borrar la nota")
    audit.record(db, user, "client.note.delete", "client_note", note_id, {})
    db.delete(note)
    db.commit()


# ------------------------------------------------------------------ perfil

@router.get("/profile", response_model=ProfessionalAdmin)
def get_profile(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    professional = get_professional(db, tenant)
    item = ProfessionalAdmin.model_validate(professional)
    item.photo_url = professional_photo_url(professional)
    return item


@router.patch("/profile", response_model=ProfessionalAdmin)
def update_profile(
    data: ProfessionalUpdate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    professional = get_professional(db, tenant)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(professional, field, value)
    audit.record(db, user, "profile.update", "professional", professional.id, changes)
    db.commit()
    db.refresh(professional)
    item = ProfessionalAdmin.model_validate(professional)
    item.photo_url = professional_photo_url(professional)
    return item


@router.get("/time-off", response_model=list[TimeOffOut])
def list_time_off(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(TimeOff).where(TimeOff.tenant_id == tenant.id).order_by(TimeOff.date)
        )
    )


@router.post("/time-off", response_model=TimeOffOut, status_code=201)
def create_time_off(
    data: TimeOffCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    professional = get_professional(db, tenant)
    existing = db.scalar(
        select(TimeOff).where(
            TimeOff.tenant_id == tenant.id, TimeOff.date == data.date
        )
    )
    if existing:
        raise HTTPException(409, "Ya existe un descanso registrado para esa fecha")
    time_off = TimeOff(
        tenant_id=tenant.id,
        professional_id=professional.id,
        date=data.date,
        reason=data.reason,
    )
    db.add(time_off)
    db.flush()
    audit.record(db, user, "time_off.create", "time_off", time_off.id,
                 {"date": str(data.date)})
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
        select(TimeOff).where(
            TimeOff.id == time_off_id, TimeOff.tenant_id == tenant.id
        )
    )
    if time_off is None:
        raise HTTPException(404, "Registro no encontrado")
    audit.record(db, user, "time_off.delete", "time_off", time_off_id,
                 {"professional_id": time_off.professional_id, "date": str(time_off.date)})
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


# ------------------------------------------------------------------ productos

def _product_out(product: Product) -> ProductAdmin:
    item = ProductAdmin.model_validate(product)
    item.photo_url = get_storage().public_url(product.photo_key) if product.photo_key else None
    return item


@router.get("/products", response_model=list[ProductAdmin])
def list_products(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    return [
        _product_out(p)
        for p in db.scalars(
            select(Product).where(Product.tenant_id == tenant.id)
            .order_by(Product.sort_order, Product.id)
        )
    ]


@router.post("/products", response_model=ProductAdmin, status_code=201)
def create_product(
    data: ProductCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    product = Product(tenant_id=tenant.id, **data.model_dump())
    db.add(product)
    db.flush()
    audit.record(db, user, "product.create", "product", product.id, data.model_dump())
    db.commit()
    db.refresh(product)
    return _product_out(product)


@router.patch("/products/{product_id}", response_model=ProductAdmin)
def update_product(
    product_id: int,
    data: ProductUpdate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant.id)
    )
    if product is None:
        raise HTTPException(404, "Producto no encontrado")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(product, field, value)
    audit.record(db, user, "product.update", "product", product.id, changes)
    db.commit()
    db.refresh(product)
    return _product_out(product)


# ------------------------------------------------------------------ regalos

@router.get("/gift-codes", response_model=list[GiftCodeOut])
def list_gift_codes(
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(GiftCode).where(GiftCode.tenant_id == tenant.id)
            .order_by(GiftCode.id.desc()).limit(100)
        )
    )


@router.post("/gift-codes", response_model=GiftCodeOut, status_code=201)
def create_gift_code(
    data: GiftCodeCreate,
    user: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """El negocio genera el código cuando alguien PAGÓ EN EL LOCAL un regalo.
    Sin venta ni cobro en línea: esto solo emite el comprobante digital."""
    import secrets as _secrets
    from datetime import timedelta as _timedelta

    from ..db import utcnow as _utcnow
    from ..services.appointments import CODE_ALPHABET

    code = None
    for _ in range(20):
        candidate = "G-" + "".join(_secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(GiftCode.id).where(GiftCode.code == candidate)):
            code = candidate
            break
    if code is None:
        raise HTTPException(500, "No fue posible generar un código único")

    gift = GiftCode(
        tenant_id=tenant.id,
        code=code,
        description=data.description.strip(),
        created_by=user.username,
        expires_at=(
            _utcnow() + _timedelta(days=data.expires_days) if data.expires_days else None
        ),
    )
    db.add(gift)
    db.flush()
    audit.record(db, user, "gift.create", "gift_code", gift.id,
                 {"code": code, "description": gift.description})
    db.commit()
    db.refresh(gift)
    return gift


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
    if kind not in ("gallery", "professional", "cut", "product"):
        raise HTTPException(400, "kind inválido")
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(415, "Formato no soportado (jpeg/png/webp/avif)")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Imagen demasiado grande (máx. 10 MB)")
    # El Content-Type declarado no es confiable: se valida el contenido real
    sniffed = sniff_image_content_type(content)
    if sniffed is None:
        raise HTTPException(415, "El archivo no es una imagen válida (jpeg/png/webp/avif)")
    key = make_key(tenant.slug, kind, sniffed)
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
    if kind not in ("gallery", "professional", "cut", "product") or not key.startswith(f"tenants/{tenant.slug}/"):
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


# ------------------------------------------------------------------ desempeño

@router.get("/stats")
def stats(
    days: int = 30,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Mi desempeño: turnos, ingresos, reseñas y top de servicios del periodo."""
    from sqlalchemy import func

    from ..models import Review

    professional = get_professional(db, tenant)
    days = min(max(days, 1), 365)
    tz = ZoneInfo(tenant.timezone)
    now = utcnow()
    today = now.astimezone(tz).date()
    range_start, _ = booking.local_day_bounds(tenant, today - timedelta(days=days - 1))
    _, today_end = booking.local_day_bounds(tenant, today)

    rows = list(
        db.scalars(
            _appointment_query().where(
                Appointment.tenant_id == tenant.id,
                Appointment.professional_id == professional.id,
                Appointment.starts_at >= range_start,
                Appointment.starts_at < today_end,
            )
        )
    )
    completed = [a for a in rows if a.status == "completado"]
    revenue = sum(a.total_cop for a in completed)

    # Top servicios del periodo (por nombre pactado en el snapshot)
    service_counts: dict[str, int] = {}
    for appointment in completed:
        for service in appointment.services:
            service_counts[service.name] = service_counts.get(service.name, 0) + 1
    top_services = sorted(service_counts.items(), key=lambda kv: -kv[1])[:5]

    rating_row = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.tenant_id == tenant.id,
            Review.professional_id == professional.id,
            Review.is_public.is_(True),
        )
    ).one()

    unique_clients = len({a.customer_whatsapp for a in completed if a.customer_whatsapp})
    upcoming_today = sum(
        1 for a in rows
        if a.status in ACTIVE_STATUSES and a.starts_at > now and a.starts_at < today_end
    )
    return {
        "days": days,
        "completed_count": len(completed),
        "cancelled_count": sum(1 for a in rows if a.status == "cancelado"),
        "no_show_count": sum(1 for a in rows if a.status == "no_show"),
        "revenue_cop": revenue,
        "unique_clients": unique_clients,
        "upcoming_today": upcoming_today,
        "top_services": [{"name": name, "count": count} for name, count in top_services],
        "rating": round(float(rating_row[0]), 1) if rating_row[0] else None,
        "review_count": rating_row[1],
    }


# ------------------------------------------------------------------ auditoría

@router.get("/security-events")
def list_security_events(
    kind: str | None = None,
    limit: int = 100,
    _: AdminUser = Depends(require_admin),
    tenant: Tenant = Depends(get_user_tenant),
    db: Session = Depends(get_db),
):
    """Eventos de seguridad del tenant (+ globales sin tenant: bloqueos de
    login y rate limits, que ocurren antes de conocer el tenant)."""
    from ..models import SecurityEvent

    query = select(SecurityEvent).where(
        (SecurityEvent.tenant_id == tenant.id) | (SecurityEvent.tenant_id.is_(None))
    )
    if kind:
        query = query.where(SecurityEvent.kind == kind)
    rows = db.scalars(query.order_by(SecurityEvent.id.desc()).limit(min(limit, 200)))
    return [
        {
            "id": r.id, "kind": r.kind, "username": r.username, "ip": r.ip,
            "detail": r.detail, "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


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
