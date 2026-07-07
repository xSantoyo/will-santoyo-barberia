"""Esquemas Pydantic v2 (contratos de la API)."""
from __future__ import annotations

import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------- utilidades

PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


def normalize_phone(v: str) -> str:
    """Normaliza a formato E.164 asumiendo Colombia (+57) si viene sin país."""
    digits = re.sub(r"[\s\-().]", "", v)
    if not PHONE_RE.match(digits):
        raise ValueError("Número de WhatsApp inválido: usa formato +57XXXXXXXXXX")
    if not digits.startswith("+"):
        digits = f"+57{digits}" if len(digits) == 10 else f"+{digits}"
    return digits


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- público

class TenantPublic(ORMModel):
    name: str
    slug: str
    whatsapp_number: str | None
    timezone: str
    brand_config: dict
    business_hours: dict


class BarberPublic(ORMModel):
    id: int
    name: str
    specialty: str | None
    instagram: str | None = None
    photo_url: str | None = None
    schedule: dict


class ServicePublic(ORMModel):
    id: int
    name: str
    price_cop: int
    duration_min: int


class AvailabilityQuery(BaseModel):
    barber_id: int
    date: date
    service_ids: list[int] = Field(min_length=1)
    # Reserva grupal: cuántas personas se cortan seguidas (mismos servicios)
    party: int = Field(default=1, ge=1, le=3)


class DayAvailability(BaseModel):
    date: date
    is_day_off: bool
    slots: list[str]  # ["09:00", "09:15", ...] hora local America/Bogota


class BookingCreate(BaseModel):
    barber_id: int
    service_ids: list[int] = Field(min_length=1, max_length=6)
    date: date
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")  # HH:MM local
    customer_name: str = Field(min_length=2, max_length=120)
    customer_whatsapp: str
    # Tanda 4: opcionales de crecimiento — sin dinero en línea
    referral_code: str | None = Field(default=None, max_length=16)
    gift_code: str | None = Field(default=None, max_length=16)

    @field_validator("customer_whatsapp")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("customer_name")
    @classmethod
    def _name(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[\w\sáéíóúÁÉÍÓÚñÑüÜ.'-]+$", clean):
            raise ValueError("El nombre contiene caracteres no permitidos")
        return clean


class AppointmentServiceOut(ORMModel):
    name: str
    price_cop: int
    duration_min: int


class PaymentPublic(BaseModel):
    reference: str
    kind: str
    status: str
    amount_cop: int
    checkout_url: str | None = None  # presente solo si aún se puede pagar
    gift_code: str | None = None     # emitido al aprobar un pago de regalo


class AppointmentPublic(ORMModel):
    manage_code: str
    status: str
    daily_number: int
    date_local: str
    time_local: str
    customer_name: str
    barber_name: str
    services: list[AppointmentServiceOut]
    total_cop: int
    # Confirmación de asistencia (Tanda 2): el tiquete muestra el aviso cuando
    # está pendiente y la hora límite local antes de la liberación automática
    attendance_pending: bool = False
    attendance_confirmed: bool = False
    attendance_deadline_local: str | None = None
    # Reseñas verificadas (Tanda 3): el tiquete invita a reseñar al completar
    can_review: bool = False
    review_rating: int | None = None
    gift_description: str | None = None  # regalo aplicado (se redime en el local)
    payment: PaymentPublic | None = None  # anticipo (si el tenant lo exige)


class AppointmentFind(BaseModel):
    customer_whatsapp: str
    manage_code: str = Field(min_length=4, max_length=12)

    @field_validator("customer_whatsapp")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


# ---------------------------------------------------------------- auth

class LoginRequest(BaseModel):
    username: str
    password: str
    # Opcional: desambigua cuando el mismo username existe en varios tenants
    tenant_slug: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    username: str
    barber_id: int | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------- admin

class BarberAdmin(ORMModel):
    id: int
    name: str
    specialty: str | None
    instagram: str | None = None
    photo_key: str | None
    photo_url: str | None = None
    schedule: dict
    is_active: bool
    sort_order: int


class BarberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    specialty: str | None = None
    instagram: str | None = Field(default=None, max_length=120)
    schedule: dict = Field(default_factory=dict)
    sort_order: int = 0


class BarberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = None
    instagram: str | None = Field(default=None, max_length=120)
    schedule: dict | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    photo_key: str | None = None


class TimeOffCreate(BaseModel):
    date: date
    reason: str | None = Field(default=None, max_length=200)


class TimeOffOut(ORMModel):
    id: int
    date: date
    reason: str | None


class ServiceAdmin(ORMModel):
    id: int
    name: str
    price_cop: int
    duration_min: int
    is_active: bool
    sort_order: int


class ServiceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    price_cop: int = Field(gt=0, le=10_000_000)
    duration_min: int = Field(ge=5, le=480)
    sort_order: int = 0


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    price_cop: int | None = Field(default=None, gt=0, le=10_000_000)
    duration_min: int | None = Field(default=None, ge=5, le=480)
    is_active: bool | None = None
    sort_order: int | None = None


class AppointmentAdmin(ORMModel):
    id: int
    barber_id: int
    barber_name: str
    customer_name: str
    customer_whatsapp: str | None
    status: str
    attendance_confirmed: bool = False
    attendance_pending: bool = False
    daily_number: int
    manage_code: str
    date_local: str
    time_local: str
    end_time_local: str
    services: list[AppointmentServiceOut]
    total_cop: int
    notes: str | None
    cancel_reason: str | None
    created_at: datetime


class ManualBookingCreate(BookingCreate):
    """El admin puede crear turnos manuales (teléfono/presencial) y saltarse
    la antelación mínima, pero nunca la prevención de solapamientos."""
    notes: str | None = Field(default=None, max_length=500)


class WalkInCreate(BaseModel):
    """Walk-in: cliente en el local, sin cita. Toma el próximo hueco de hoy."""
    barber_id: int
    service_ids: list[int] = Field(min_length=1, max_length=6)
    customer_name: str = Field(min_length=2, max_length=120)
    customer_whatsapp: str | None = None  # opcional: puede no dejar teléfono

    @field_validator("customer_whatsapp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        return normalize_phone(v)

    @field_validator("customer_name")
    @classmethod
    def _name(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[\w\sáéíóúÁÉÍÓÚñÑüÜ.'-]+$", clean):
            raise ValueError("El nombre contiene caracteres no permitidos")
        return clean


class RescheduleRequest(BaseModel):
    barber_id: int | None = None
    date: date
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")


class StatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        from .models import APPOINTMENT_STATUSES

        if v not in APPOINTMENT_STATUSES:
            raise ValueError(f"Estado inválido: {v}")
        return v


# ---------------------------------------------------------------- pagos

class GiftCheckoutCreate(BaseModel):
    """Compra de un regalo en línea: se elige un servicio como regalo."""
    service_id: int
    payer_name: str = Field(min_length=2, max_length=120)
    payer_whatsapp: str | None = None

    @field_validator("payer_whatsapp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        return normalize_phone(v)


class SimulatePaymentRequest(BaseModel):
    approve: bool


class PaymentSettings(BaseModel):
    deposits_enabled: bool | None = None
    deposit_cop: int | None = Field(default=None, ge=1000, le=200_000)
    gift_shop_enabled: bool | None = None


# ---------------------------------------------------------------- tanda 4

class GroupMember(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    service_ids: list[int] = Field(min_length=1, max_length=6)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[\w\sáéíóúÁÉÍÓÚñÑüÜ.'-]+$", clean):
            raise ValueError("El nombre contiene caracteres no permitidos")
        return clean


class GroupBookingCreate(BaseModel):
    """Turnos seguidos con el mismo barbero (padre e hijo, parche de amigos)."""
    barber_id: int
    date: date
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    customer_whatsapp: str  # un teléfono responsable del grupo
    customers: list[GroupMember] = Field(min_length=1, max_length=3)

    @field_validator("customer_whatsapp")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class RebookRequest(BaseModel):
    weeks: int = Field(ge=1, le=4)  # dentro del horizonte de reserva


class ProductPublic(ORMModel):
    id: int
    name: str
    description: str | None
    price_cop: int
    photo_url: str | None = None


class ProductAdmin(ProductPublic):
    photo_key: str | None
    is_active: bool
    sort_order: int


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=300)
    price_cop: int = Field(gt=0, le=10_000_000)
    sort_order: int = 0


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=300)
    price_cop: int | None = Field(default=None, gt=0, le=10_000_000)
    photo_key: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class GiftCodeCreate(BaseModel):
    description: str = Field(min_length=3, max_length=200)
    expires_days: int | None = Field(default=None, ge=1, le=365)


class GiftCodeOut(ORMModel):
    id: int
    code: str
    description: str
    created_by: str
    created_at: datetime
    expires_at: datetime | None
    held_by_appointment_id: int | None
    redeemed_at: datetime | None


# ---------------------------------------------------------------- tanda 3

class PortalRequest(BaseModel):
    """Portal ligero sin contraseña: teléfono + cualquier código de sus turnos."""
    customer_whatsapp: str
    manage_code: str = Field(min_length=4, max_length=12)

    @field_validator("customer_whatsapp")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class ReviewPublic(ORMModel):
    rating: int
    comment: str | None
    customer_label: str  # nombre abreviado: "Juan P."
    barber_name: str
    date_local: str


class ClientNoteCreate(BaseModel):
    note: str = Field(min_length=2, max_length=800)


class ClientNoteOut(ORMModel):
    id: int
    author_name: str
    note: str
    created_at: datetime


class MediaAssetOut(ORMModel):
    id: int
    kind: str
    s3_key: str
    title: str | None
    sort_order: int
    url: str | None = None


class PresignRequest(BaseModel):
    kind: str = Field(pattern="^(gallery|barber|cut|product)$")
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(pattern="^image/(jpeg|png|webp|avif)$")


class DashboardOut(BaseModel):
    date_local: str
    barbers: list[dict]  # {barber, current, upcoming, done_count, ...}
