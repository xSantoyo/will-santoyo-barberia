"""Dependencias FastAPI compartidas: DB, tenant, usuario autenticado, rate limit."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

import jwt as pyjwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AdminUser, Tenant
from .security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_tenant_by_slug(tenant_slug: str, db: Session = Depends(get_db)) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug))
    if tenant is None:
        raise HTTPException(404, "Barbería no encontrada")
    return tenant


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AdminUser:
    if credentials is None:
        raise HTTPException(401, "No autenticado", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(credentials.credentials, "access")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido o expirado",
                            headers={"WWW-Authenticate": "Bearer"}) from None
    user = db.get(AdminUser, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(401, "Usuario inactivo")
    return user


def require_admin(user: AdminUser = Depends(get_current_user)) -> AdminUser:
    if user.role != "admin":
        raise HTTPException(403, "Se requiere rol de administrador")
    return user


def get_user_tenant(
    user: AdminUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> Tenant:
    return db.get(Tenant, user.tenant_id)


class RateLimiter:
    """Ventana deslizante en memoria por IP. Suficiente para un contenedor
    (local / una instancia Lambda); en prod se complementa con el throttling
    de API Gateway configurado en Terraform."""

    def __init__(self, max_requests: int | None = None, window_seconds: int | None = None):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        settings = get_settings()
        max_requests = self.max_requests or settings.rate_limit_requests
        window = self.window_seconds or settings.rate_limit_window_seconds
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            hits = self._hits[ip]
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= max_requests:
                raise HTTPException(429, "Demasiadas solicitudes. Intenta de nuevo en un minuto.")
            hits.append(now)


booking_rate_limiter = RateLimiter()
