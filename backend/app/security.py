"""Autenticación: hashing bcrypt y emisión/verificación de JWT.

Se usa la librería `bcrypt` directamente (passlib está sin mantenimiento y
rompe con bcrypt>=4.1 en Python 3.12+). Access token corto (30 min) +
refresh token (14 días) con `token_version` para invalidación global.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import bcrypt
import jwt

from .config import get_settings
from .db import utcnow


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _encode(payload: dict[str, Any], expires_delta: timedelta) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {**payload, "iat": now, "exp": now + expires_delta}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int, tenant_id: int, role: str) -> str:
    settings = get_settings()
    return _encode(
        {
            "sub": str(user_id),
            "tenant_id": tenant_id,
            "role": role,
            "type": "access",
        },
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user_id: int, token_version: int) -> str:
    settings = get_settings()
    return _encode(
        {"sub": str(user_id), "token_version": token_version, "type": "refresh"},
        timedelta(days=settings.refresh_token_days),
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Lanza jwt.InvalidTokenError si el token es inválido/expirado/de otro tipo."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"Se esperaba token de tipo {expected_type}")
    return payload
