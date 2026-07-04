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
    barber_name: str
    services: list[AppointmentServiceOut]
    total_cop: int


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
    photo_key: str | None
    photo_url: str | None = None
    schedule: dict
    is_active: bool
    sort_order: int


class BarberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    specialty: str | None = None
    schedule: dict = Field(default_factory=dict)
    sort_order: int = 0


class BarberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = None
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
    customer_whatsapp: str
    status: str
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


class MediaAssetOut(ORMModel):
    id: int
    kind: str
    s3_key: str
    title: str | None
    sort_order: int
    url: str | None = None


class PresignRequest(BaseModel):
    kind: str = Field(pattern="^(gallery|barber|cut)$")
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(pattern="^image/(jpeg|png|webp|avif)$")


class DashboardOut(BaseModel):
    date_local: str
    barbers: list[dict]  # {barber, current, upcoming, done_count, ...}
