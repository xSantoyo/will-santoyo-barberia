"""Servicio de seguridad: eventos, anti fuerza bruta, Turnstile y ráfagas.

Piezas (auditoría jul-2026):
- log_event: registra eventos de seguridad en DB y como línea JSON en el logger
  `willbarbershop.security` (stdout → CloudWatch Logs → metric filters → alarmas SNS).
- Lockout de login: bloqueo TEMPORAL por usuario Y por IP tras N fallos, con
  backoff exponencial. Nunca permanente: un bloqueo definitivo permitiría a un
  atacante dejar fuera al admin real con 5 intentos deliberados.
- verify_turnstile: valida el token de Cloudflare Turnstile (solo si hay
  secret configurado; en desarrollo queda apagado y no estorba).
- Honeypot y ráfagas de reservas: detección de bots/abuso que registra sin
  bloquear (el bloqueo duro es del rate limiter).
"""
from __future__ import annotations

import json
import logging
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..models import LoginThrottle, SecurityEvent, Tenant

logger = logging.getLogger("willbarbershop.security")


# ---------------------------------------------------------------- eventos

def log_event(
    db: Session | None,
    *,
    kind: str,
    tenant_id: int | None = None,
    username: str | None = None,
    ip: str | None = None,
    detail: dict | None = None,
) -> None:
    """Registra un evento de seguridad. Hace commit propio: el evento debe
    persistir aunque el request termine en 4xx. Si `db` es None (p. ej. desde
    el rate limiter, que no tiene sesión), abre una sesión corta propia.

    La línea JSON en el logger es la fuente para los metric filters de
    CloudWatch (ver infra/modules/monitoring)."""
    payload = {
        "event": kind,
        "tenant_id": tenant_id,
        "username": username,
        "ip": ip,
        **(detail or {}),
    }
    logger.warning("SECURITY %s", json.dumps(payload, ensure_ascii=False, default=str))

    own_session = db is None
    session = db or SessionLocal()
    try:
        session.add(
            SecurityEvent(
                tenant_id=tenant_id, kind=kind, username=username, ip=ip,
                detail=detail or {},
            )
        )
        session.commit()
    except Exception:  # el registro nunca debe tumbar la operación principal
        session.rollback()
        logger.exception("No se pudo persistir el evento de seguridad %s", kind)
    finally:
        if own_session:
            session.close()


# ---------------------------------------------------------------- lockout login

def _get_throttle(db: Session, scope: str, key: str) -> LoginThrottle | None:
    return db.scalar(
        select(LoginThrottle).where(LoginThrottle.scope == scope, LoginThrottle.key == key)
    )


def login_locked_until(db: Session, username: str, ip: str) -> int:
    """Segundos restantes de bloqueo (0 = puede intentar). Combina el throttle
    por usuario Y por IP: solo por usuario sería insuficiente ante un ataque
    distribuido sobre muchas cuentas; solo por IP, ante uno desde muchas IPs."""
    now = utcnow()
    remaining = 0
    for scope, key in (("user", username.strip().lower()), ("ip", ip)):
        row = _get_throttle(db, scope, key)
        if row and row.locked_until and row.locked_until > now:
            remaining = max(remaining, int((row.locked_until - now).total_seconds()))
    return remaining


def register_login_failure(
    db: Session, *, username: str, ip: str, tenant_id: int | None = None
) -> int:
    """Registra un intento fallido en ambos ámbitos. Devuelve los segundos de
    bloqueo si este fallo disparó el umbral (0 si aún no)."""
    settings = get_settings()
    now = utcnow()
    window = timedelta(minutes=settings.login_failure_window_minutes)
    decay = timedelta(hours=settings.login_lockout_decay_hours)
    lock_seconds = 0

    log_event(db, kind="login_failed", tenant_id=tenant_id,
              username=username.strip().lower(), ip=ip)

    for scope, key in (("user", username.strip().lower()), ("ip", ip)):
        row = _get_throttle(db, scope, key)
        if row is None:
            row = LoginThrottle(scope=scope, key=key, failures=0, lockout_level=0)
            db.add(row)
        # Los fallos viejos no cuentan; el nivel de backoff decae con el tiempo
        if row.last_failure_at and row.last_failure_at < now - window:
            row.failures = 0
        if row.last_failure_at and row.last_failure_at < now - decay:
            row.lockout_level = 0
        row.failures += 1
        row.last_failure_at = now
        if row.failures >= settings.login_max_failures:
            minutes = min(
                settings.login_lockout_minutes * (2 ** row.lockout_level),
                settings.login_lockout_max_minutes,
            )
            row.locked_until = now + timedelta(minutes=minutes)
            row.lockout_level += 1
            row.failures = 0
            lock_seconds = max(lock_seconds, minutes * 60)
            log_event(
                db, kind="login_locked", tenant_id=tenant_id,
                username=username.strip().lower(), ip=ip,
                detail={"scope": scope, "minutes": minutes, "level": row.lockout_level},
            )
    db.commit()
    return lock_seconds


def register_login_success(db: Session, *, username: str, ip: str,
                           tenant_id: int | None = None) -> None:
    """Un login correcto limpia contadores y bloqueos de ese usuario e IP."""
    for scope, key in (("user", username.strip().lower()), ("ip", ip)):
        row = _get_throttle(db, scope, key)
        if row is not None:
            row.failures = 0
            row.lockout_level = 0
            row.locked_until = None
    db.commit()
    log_event(db, kind="login_success", tenant_id=tenant_id,
              username=username.strip().lower(), ip=ip)


# ---------------------------------------------------------------- Turnstile

def verify_turnstile(token: str | None, ip: str | None) -> bool:
    """Valida el token de Cloudflare Turnstile contra siteverify.

    Si Turnstile no está configurado (sin secret) devuelve True: el CAPTCHA es
    opt-in por despliegue. Ante un error de red se rechaza (fail closed): un
    atacante no debe poder saltarse el CAPTCHA tumbando la verificación."""
    settings = get_settings()
    if not settings.turnstile_enabled:
        return True
    if not token:
        return False
    import httpx

    try:
        response = httpx.post(
            settings.turnstile_verify_url,
            data={"secret": settings.turnstile_secret_key, "response": token,
                  "remoteip": ip or ""},
            timeout=7,
        )
        return bool(response.json().get("success"))
    except Exception:
        logger.exception("Error verificando Turnstile")
        return False


# ---------------------------------------------------------------- ráfagas

def note_public_booking(db: Session, tenant: Tenant, *, ip: str | None,
                        phone: str | None) -> None:
    """Registra la reserva pública y detecta ráfagas (misma IP o mismo teléfono
    en poco tiempo). Solo REGISTRA el patrón — no bloquea: el freno duro es el
    rate limiter, y aquí un falso positivo no puede dañar una venta real."""
    settings = get_settings()
    log_event(db, kind="booking_created", tenant_id=tenant.id, ip=ip,
              detail={"phone": phone})

    window_start = utcnow() - timedelta(minutes=settings.booking_burst_window_minutes)
    for field, value, threshold in (
        ("ip", ip, settings.booking_burst_ip_threshold),
        ("phone", phone, settings.booking_burst_phone_threshold),
    ):
        if not value:
            continue
        query = select(func.count()).select_from(SecurityEvent).where(
            SecurityEvent.tenant_id == tenant.id,
            SecurityEvent.kind == "booking_created",
            SecurityEvent.created_at >= window_start,
        )
        if field == "ip":
            query = query.where(SecurityEvent.ip == value)
        else:
            query = query.where(SecurityEvent.detail["phone"].as_string() == value)
        count = db.scalar(query) or 0
        if count < threshold:
            continue
        already = db.scalar(
            select(SecurityEvent.id).where(
                SecurityEvent.tenant_id == tenant.id,
                SecurityEvent.kind == "booking_burst",
                SecurityEvent.created_at >= window_start,
                (SecurityEvent.ip == value) if field == "ip"
                else (SecurityEvent.detail["phone"].as_string() == value),
            )
        )
        if already:
            continue  # ya alertamos por esta llave en la ventana actual
        log_event(
            db, kind="booking_burst", tenant_id=tenant.id,
            ip=value if field == "ip" else None,
            detail={"by": field, "phone": phone if field == "phone" else None,
                    "count": count, "window_minutes": settings.booking_burst_window_minutes},
        )
