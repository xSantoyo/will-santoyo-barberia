"""Esquemas Pydantic v2 (contratos de la API)."""
from __future__ import annotations

import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------- utilidades

PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def normalize_phone(v: str) -> str:
    """Normaliza a formato E.164 asumiendo Colombia (+57) si viene sin país."""
    digits = re.sub(r"[\s\-().]", "", v)
    if not PHONE_RE.match(digits):
        raise ValueError("Número de WhatsApp inválido: usa formato +57XXXXXXXXXX")
    if not digits.startswith("+"):
        digits = f"+57{digits}" if len(digits) == 10 else f"+{digits}"
    return digits


def normalize_email(v: str | None) -> str | None:
    """Correo opcional: vacío → None; inválido → error. Regex simple a
    propósito — la validación definitiva la hace el proveedor al enviar."""
    if v is None or not v.strip():
        return None
    clean = v.strip().lower()
    if not EMAIL_RE.match(clean) or len(clean) > 200:
        raise ValueError("Correo electrónico inválido")
    return clean


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


class ProfessionalPublic(ORMModel):
    """Will, tal como lo ve el sitio público. Sin identificador: no hay a quién
    elegir, así que nada que referenciar desde el cliente."""

    name: str
    headline: str | None
    instagram: str | None = None
    photo_url: str | None = None
    schedule: dict


class ServicePublic(ORMModel):
    id: int
    name: str
    price_cop: int
    duration_min: int


class AvailabilityQuery(BaseModel):
    date: date
    service_ids: list[int] = Field(min_length=1)
    # Reserva grupal: cuántas personas se cortan seguidas (mismos servicios)
    party: int = Field(default=1, ge=1, le=3)


class DayAvailability(BaseModel):
    date: date
    is_day_off: bool
    slots: list[str]  # ["09:00", "09:15", ...] hora local America/Bogota


class BookingCreate(BaseModel):
    service_ids: list[int] = Field(min_length=1, max_length=6)
    date: date
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")  # HH:MM local
    customer_name: str = Field(min_length=2, max_length=120)
    customer_whatsapp: str
    # Correo OPCIONAL: copia de cortesía de la confirmación (ronda Resend).
    # El código en pantalla sigue siendo el canal oficial (ADR-009).
    customer_email: str | None = Field(default=None, max_length=200)
    # Tanda 4: opcionales de crecimiento — sin dinero en línea
    referral_code: str | None = Field(default=None, max_length=16)
    gift_code: str | None = Field(default=None, max_length=16)
    # Anti-bots: honeypot (campo oculto) y token de Turnstile (si está activo)
    website: str | None = None
    captcha_token: str | None = None

    @field_validator("customer_email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        return normalize_email(v)

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


class AppointmentPublic(ORMModel):
    manage_code: str
    status: str
    daily_number: int
    date_local: str
    time_local: str
    customer_name: str
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
    # Ventana de cancelación: el frontend deshabilita el botón con el motivo
    # en vez de recalcular la regla (el backend es la fuente de verdad).
    can_cancel: bool = False
    cancel_blocked_reason: str | None = None


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
    # Anti-bots: honeypot (un humano nunca lo llena) y token de Turnstile
    website: str | None = None
    captcha_token: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if v.strip() != v:
            raise ValueError("La contraseña no puede empezar ni terminar en espacios")
        has_letter = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError("La contraseña debe combinar letras y números")
        return v


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    username: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------- admin

class ProfessionalAdmin(ORMModel):
    name: str
    headline: str | None
    instagram: str | None = None
    photo_key: str | None
    photo_url: str | None = None
    schedule: dict


class ProfessionalUpdate(BaseModel):
    """Will editando su propio perfil. No se crea ni se borra: siempre es él."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    headline: str | None = Field(default=None, max_length=200)
    instagram: str | None = Field(default=None, max_length=120)
    schedule: dict | None = None
    sort_order: int | None = None
    photo_key: str | None = None


class ReviewModeration(BaseModel):
    """Aprobar (True) o retirar (False) una reseña."""

    is_public: bool


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
    """Turnos seguidos, uno detrás del otro (padre e hijo, parche de amigos)."""
    date: date
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    customer_whatsapp: str  # un teléfono responsable del grupo
    customers: list[GroupMember] = Field(min_length=1, max_length=3)
    # Anti-bots (mismo contrato que BookingCreate)
    website: str | None = None
    captcha_token: str | None = None

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
    kind: str = Field(pattern="^(gallery|professional|cut|product)$")
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(pattern="^image/(jpeg|png|webp|avif)$")


class DashboardOut(BaseModel):
    date_local: str
    professionals: list[dict]  # {professional, current, upcoming, done_count, ...}
