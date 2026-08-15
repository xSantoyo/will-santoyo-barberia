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


def client_ip(request: Request) -> str:
    """IP real del cliente. Detrás de API Gateway/CloudFront la conexión llega
    por proxy: se toma el primer salto de X-Forwarded-For (el que agrega la
    infraestructura, no uno inventado por el cliente, porque API Gateway
    sobreescribe la cadena)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Registro global para poder limpiar todos los limitadores en tests
RATE_LIMITERS: list[RateLimiter] = []


class RateLimiter:
    """Ventana deslizante en memoria por IP. Suficiente para un contenedor
    (local / una instancia Lambda); en prod se complementa con el throttling
    de API Gateway configurado en Terraform.

    `name` identifica el tipo de endpoint en los eventos de seguridad. La
    activación del límite se registra (máx. una vez por IP y ventana, para no
    inundar la tabla durante un ataque)."""

    def __init__(
        self,
        max_requests: int | None = None,
        window_seconds: int | None = None,
        name: str = "public_write",
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_logged: dict[str, float] = {}
        self._lock = threading.Lock()
        RATE_LIMITERS.append(self)

    def forgive(self, request: Request) -> None:
        """Descuenta el último hit de esta IP (p. ej. un login CORRECTO no debe
        consumir el cupo estricto pensado para frenar adivinación)."""
        ip = client_ip(request)
        with self._lock:
            hits = self._hits.get(ip)
            if hits:
                hits.pop()

    def __call__(self, request: Request) -> None:
        settings = get_settings()
        max_requests = self.max_requests or settings.rate_limit_requests
        window = self.window_seconds or settings.rate_limit_window_seconds
        ip = client_ip(request)
        now = time.monotonic()
        with self._lock:
            hits = self._hits[ip]
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= max_requests:
                retry_after = max(1, int(hits[0] + window - now))
                should_log = now - self._last_logged.get(ip, -1e12) >= window
                if should_log:
                    self._last_logged[ip] = now
            else:
                hits.append(now)
                return
        if should_log:
            # Fuera del lock: el log escribe en DB con su propia sesión
            from .services.security import log_event

            log_event(None, kind="rate_limited", ip=ip,
                      detail={"limiter": self.name, "window_seconds": window})
        raise HTTPException(
            429,
            "Demasiadas solicitudes. Intenta de nuevo en unos minutos.",
            headers={"Retry-After": str(retry_after)},
        )


def _strict(name: str) -> RateLimiter:
    settings = get_settings()
    return RateLimiter(settings.strict_rate_limit_requests,
                       settings.strict_rate_limit_window_seconds, name)


# Escritura pública (reservas, cancelaciones, reseñas): moderado
booking_rate_limiter = RateLimiter(name="public_write")
# Lectura pública (disponibilidad, fila, listados): generoso, frena scraping
read_rate_limiter = RateLimiter(
    get_settings().read_rate_limit_requests,
    get_settings().read_rate_limit_window_seconds,
    "public_read",
)
# Consulta por código (tiquete, pago): tolera polling, impide enumeración
lookup_rate_limiter = RateLimiter(
    get_settings().lookup_rate_limit_requests,
    get_settings().lookup_rate_limit_window_seconds,
    "code_lookup",
)
# Sensibles (5 cada 15 min, cada uno con contador propio)
login_rate_limiter = _strict("login")
password_rate_limiter = _strict("password_change")
payment_rate_limiter = _strict("payment_start")
refresh_rate_limiter = RateLimiter(30, 60, "token_refresh")
webhook_rate_limiter = RateLimiter(60, 60, "payment_webhook")
