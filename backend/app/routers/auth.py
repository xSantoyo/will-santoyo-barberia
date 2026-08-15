"""Autenticación del panel de Will.

Defensas de la ronda de seguridad (jul-2026):
- Rate limit estricto por IP (5 / 15 min) — un login CORRECTO se descuenta
  para no estorbar el uso legítimo del equipo tras una misma IP.
- Bloqueo TEMPORAL por usuario Y por IP tras 5 fallos, con backoff exponencial
  (nunca permanente: eso permitiría bloquear al admin real a propósito).
- Honeypot (`website`): campo oculto que un humano nunca llena.
- Cloudflare Turnstile opcional (activo si hay secret configurado).
- Todo intento fallido queda registrado con IP, usuario y timestamp.
"""
from __future__ import annotations

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import (
    client_ip,
    get_current_user,
    login_rate_limiter,
    password_rate_limiter,
    refresh_rate_limiter,
)
from ..models import AdminUser
from ..schemas import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenPair
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from ..services import security as guard

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _token_pair(user: AdminUser) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.tenant_id, user.role),
        refresh_token=create_refresh_token(user.id, user.token_version),
        role=user.role,
        username=user.username,
    )


@router.post("/login", response_model=TokenPair, dependencies=[Depends(login_rate_limiter)])
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    username = data.username.strip().lower()

    # Honeypot: los bots rellenan el campo oculto. Respuesta idéntica a
    # credenciales malas para no darles señal de que fueron detectados.
    if data.website:
        guard.log_event(db, kind="honeypot", username=username, ip=ip,
                        detail={"form": "login"})
        raise HTTPException(401, "Usuario o contraseña incorrectos")

    if not guard.verify_turnstile(data.captcha_token, ip):
        guard.log_event(db, kind="captcha_failed", username=username, ip=ip,
                        detail={"form": "login"})
        raise HTTPException(403, "Verificación anti-bot fallida. Recarga e intenta de nuevo.")

    # Bloqueo temporal vigente (por usuario o por IP)
    locked = guard.login_locked_until(db, username, ip)
    if locked > 0:
        raise HTTPException(
            429,
            "Demasiados intentos fallidos. Intenta de nuevo más tarde.",
            headers={"Retry-After": str(locked)},
        )

    query = select(AdminUser).where(AdminUser.username == username)
    if data.tenant_slug:
        from ..models import Tenant

        query = query.join(Tenant, Tenant.id == AdminUser.tenant_id).where(
            Tenant.slug == data.tenant_slug
        )
    users = list(db.scalars(query))
    if len(users) > 1:
        # username repetido entre tenants: el cliente debe enviar tenant_slug
        raise HTTPException(409, "Especifica el negocio (tenant_slug) para iniciar sesión")
    user = users[0] if users else None
    # verify_password corre siempre (timing uniforme exista o no el usuario)
    valid = verify_password(
        data.password, user.password_hash if user else "$2b$12$" + "x" * 53
    )
    if user is None or not valid or not user.is_active:
        lock_seconds = guard.register_login_failure(
            db, username=username, ip=ip, tenant_id=user.tenant_id if user else None
        )
        if lock_seconds:
            raise HTTPException(
                429,
                "Demasiados intentos fallidos. Intenta de nuevo más tarde.",
                headers={"Retry-After": str(lock_seconds)},
            )
        raise HTTPException(401, "Usuario o contraseña incorrectos")

    guard.register_login_success(db, username=username, ip=ip, tenant_id=user.tenant_id)
    # Un login correcto no consume el cupo estricto anti fuerza bruta
    login_rate_limiter.forgive(request)
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair,
             dependencies=[Depends(refresh_rate_limiter)])
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token, "refresh")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Refresh token inválido o expirado") from None
    user = db.get(AdminUser, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(401, "Usuario inactivo")
    if payload.get("token_version") != user.token_version:
        raise HTTPException(401, "Sesión revocada, inicia sesión de nuevo")
    return _token_pair(user)


@router.post("/change-password", response_model=TokenPair,
             dependencies=[Depends(password_rate_limiter)])
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    user: AdminUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cambio de la propia contraseña. Exige la contraseña actual, invalida
    todos los refresh tokens emitidos (token_version) y devuelve un par nuevo."""
    ip = client_ip(request)
    if not verify_password(data.current_password, user.password_hash):
        guard.log_event(db, kind="login_failed", tenant_id=user.tenant_id,
                        username=user.username, ip=ip,
                        detail={"context": "change_password"})
        raise HTTPException(401, "La contraseña actual no es correcta")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # revoca refresh tokens en todos los dispositivos
    db.commit()
    guard.log_event(db, kind="password_changed", tenant_id=user.tenant_id,
                    username=user.username, ip=ip)
    return _token_pair(user)
