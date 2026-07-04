"""Autenticación de administradores y barberos."""
from __future__ import annotations

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import RateLimiter
from ..models import AdminUser
from ..schemas import LoginRequest, RefreshRequest, TokenPair
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Límite estricto para frenar fuerza bruta de credenciales
login_rate_limiter = RateLimiter(max_requests=5, window_seconds=60)


def _token_pair(user: AdminUser) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.tenant_id, user.role, user.barber_id),
        refresh_token=create_refresh_token(user.id, user.token_version),
        role=user.role,
        username=user.username,
        barber_id=user.barber_id,
    )


@router.post("/login", response_model=TokenPair, dependencies=[Depends(login_rate_limiter)])
def login(data: LoginRequest, db: Session = Depends(get_db)):
    query = select(AdminUser).where(AdminUser.username == data.username.strip().lower())
    if data.tenant_slug:
        from ..models import Tenant

        query = query.join(Tenant, Tenant.id == AdminUser.tenant_id).where(
            Tenant.slug == data.tenant_slug
        )
    users = list(db.scalars(query))
    if len(users) > 1:
        # username repetido entre tenants: el cliente debe enviar tenant_slug
        raise HTTPException(409, "Especifica la barbería (tenant_slug) para iniciar sesión")
    user = users[0] if users else None
    # verify_password corre siempre (timing uniforme exista o no el usuario)
    valid = verify_password(
        data.password, user.password_hash if user else "$2b$12$" + "x" * 53
    )
    if user is None or not valid or not user.is_active:
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair)
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
