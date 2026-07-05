"""Modelo de datos multi-tenant.

Regla de oro: toda tabla de negocio lleva `tenant_id` y los índices compuestos
empiezan por `tenant_id`. La prevención de doble-reserva vive en la base de
datos (constraint de exclusión Postgres, ver migración 0001) además de la
validación de aplicación.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, TZDateTime, utcnow

# JSONB en Postgres, JSON plano en SQLite (tests)
JsonCol = JSON().with_variant(JSONB(), "postgresql")

APPOINTMENT_STATUSES = ("pendiente", "confirmado", "en_curso", "completado", "cancelado", "no_show")
ACTIVE_STATUSES = ("pendiente", "confirmado", "en_curso")  # ocupan horario


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    timezone: Mapped[str] = mapped_column(String(50), default="America/Bogota")
    # {"address": ..., "instagram": ..., "colors": {...}, ...} — configuración de marca
    brand_config: Mapped[dict] = mapped_column(JsonCol, default=dict)
    # {"mon": {"start": "09:00", "end": "20:00"}, ..., "sun": null}
    business_hours: Mapped[dict] = mapped_column(JsonCol, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)

    barbers: Mapped[list[Barber]] = relationship(back_populates="tenant")


class Barber(Base):
    __tablename__ = "barbers"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    photo_key: Mapped[str | None] = mapped_column(String(300))
    specialty: Mapped[str | None] = mapped_column(String(200))
    # Handle (@usuario) o URL completa del Instagram del barbero
    instagram: Mapped[str | None] = mapped_column(String(120))
    # Horario semanal: {"mon": {"start": "09:00", "end": "19:00"}, ..., "sun": null}
    # null / clave ausente = día de descanso recurrente
    schedule: Mapped[dict] = mapped_column(JsonCol, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="barbers")
    time_off: Mapped[list[BarberTimeOff]] = relationship(
        back_populates="barber", cascade="all, delete-orphan"
    )


class BarberTimeOff(Base):
    """Excepciones puntuales al horario recurrente (vacaciones, citas médicas)."""

    __tablename__ = "barber_time_off"
    __table_args__ = (UniqueConstraint("barber_id", "date", name="uq_barber_time_off"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    barber_id: Mapped[int] = mapped_column(ForeignKey("barbers.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(200))

    barber: Mapped[Barber] = relationship(back_populates="time_off")


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    price_cop: Mapped[int] = mapped_column(Integer)  # COP no usa decimales
    duration_min: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_appointment_range"),
        Index("ix_appointments_tenant_start", "tenant_id", "starts_at"),
        Index("ix_appointments_barber_start", "barber_id", "starts_at"),
        # El constraint EXCLUDE USING gist anti doble-reserva es Postgres-only
        # y se crea en la migración Alembic 0001 (ver ADR-003).
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    barber_id: Mapped[int] = mapped_column(ForeignKey("barbers.id"), index=True)
    customer_name: Mapped[str] = mapped_column(String(120))
    # Nullable: un walk-in puede no dejar teléfono (la reserva pública sí lo exige)
    customer_whatsapp: Mapped[str | None] = mapped_column(String(20), index=True)
    starts_at: Mapped[datetime] = mapped_column(TZDateTime)
    ends_at: Mapped[datetime] = mapped_column(TZDateTime)
    status: Mapped[str] = mapped_column(String(20), default="confirmado", index=True)
    daily_number: Mapped[int] = mapped_column(Integer)  # "turno N° del día" por barbero
    manage_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    cancel_reason: Mapped[str | None] = mapped_column(String(300))
    cancelled_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # Confirmación de asistencia (el cliente confirma desde su tiquete el día antes)
    attendance_confirmed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)

    barber: Mapped[Barber] = relationship()
    services: Mapped[list[AppointmentService]] = relationship(
        back_populates="appointment", cascade="all, delete-orphan"
    )
    review: Mapped[Review | None] = relationship(back_populates="appointment", uselist=False)

    @property
    def total_cop(self) -> int:
        return sum(s.price_cop for s in self.services)


class AppointmentService(Base):
    """Snapshot de servicio al momento de reservar: si el precio cambia después,
    el turno conserva lo pactado."""

    __tablename__ = "appointment_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id", ondelete="CASCADE"), index=True
    )
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    price_cop: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer)

    appointment: Mapped[Appointment] = relationship(back_populates="services")


class AdminUser(Base):
    __tablename__ = "admin_users"
    __table_args__ = (UniqueConstraint("tenant_id", "username", name="uq_admin_users_username"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    username: Mapped[str] = mapped_column(String(60))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin | barbero
    barber_id: Mapped[int | None] = mapped_column(ForeignKey("barbers.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Incrementar para invalidar todos los refresh tokens emitidos (logout global)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    barber: Mapped[Barber | None] = relationship()


class MediaAsset(Base):
    __tablename__ = "media_assets"
    __table_args__ = (Index("ix_media_assets_tenant_kind", "tenant_id", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # gallery | barber | cut
    s3_key: Mapped[str] = mapped_column(String(300), unique=True)
    title: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class ClientNote(Base):
    """Notas de estilo sobre un cliente recurrente (Tanda 3, D2/D7).

    La llave del cliente es su teléfono normalizado. Visibles para todo el
    equipo que lo atienda (criterio D7); cada nota registra su autor.
    """

    __tablename__ = "client_notes"
    __table_args__ = (
        Index("ix_client_notes_tenant_phone", "tenant_id", "customer_whatsapp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    customer_whatsapp: Mapped[str] = mapped_column(String(20))
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"))
    author_name: Mapped[str] = mapped_column(String(60))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class Review(Base):
    """Reseñas verificadas (Tanda 3, C4): solo nacen de una cita real
    completada, vía su código de gestión — una por cita."""

    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id"), unique=True, index=True
    )
    barber_id: Mapped[int] = mapped_column(ForeignKey("barbers.id"), index=True)
    customer_whatsapp: Mapped[str | None] = mapped_column(String(20))
    customer_name: Mapped[str] = mapped_column(String(120))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(500))
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    appointment: Mapped[Appointment] = relationship(back_populates="review")


class AuditLog(Base):
    """Quién hizo qué y cuándo, para acciones administrativas."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"))
    actor_username: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(60))  # appointment.cancel, service.update, ...
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JsonCol, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
