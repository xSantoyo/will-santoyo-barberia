"""Configuración central de la aplicación.

En local se lee de variables de entorno / .env. En AWS, las variables sensibles
se cargan desde Secrets Manager al arrancar el contenedor Lambda (ver
`load_aws_secrets`), de modo que nunca viajan en texto plano por Terraform state
ni por la consola de Lambda salvo el nombre del prefijo.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"  # local | dev | prod

    database_url: str = "sqlite:///./dev.db"

    # --- Auth ---
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    # --- CORS / URLs ---
    cors_origins: str = "http://localhost:3000"
    public_base_url: str = "http://localhost:3000"  # para construir enlaces de gestión

    # --- Almacenamiento de imágenes ---
    storage_backend: str = "local"  # local | s3
    local_media_root: str = "../content"  # raíz local: <root>/<tenant_slug>/<kind>/
    s3_bucket: str = ""
    cdn_base_url: str = ""
    aws_region: str = "us-east-1"

    # --- Reglas de negocio ---
    # Un turno dura SIEMPRE esto, sin importar cuántos servicios se elijan:
    # la agenda de Will trabaja en bloques de una hora.
    appointment_minutes: int = 60
    # La grilla avanza igual que la duración: así los bloques no se solapan
    # ni dejan huecos muertos de 15 minutos entre turnos.
    slot_step_minutes: int = 60         # granularidad de la grilla de horarios
    # Hasta cuántos minutos antes del inicio puede cancelar el cliente.
    cancel_window_minutes: int = 15
    booking_lead_minutes: int = 30      # antelación mínima para reservar
    booking_horizon_days: int = 30      # hasta cuántos días adelante se puede reservar
    no_show_grace_minutes: int = 15     # tolerancia antes de alertar no-show
    # Confirmación de asistencia: aplica a reservas hechas con >= opens_hours de
    # antelación; se abre opens_hours antes del turno y si no confirma cuando
    # faltan deadline_hours, el turno se libera automáticamente.
    attendance_opens_hours: int = 24
    attendance_deadline_hours: int = 3

    # --- Rate limiting (endpoints públicos) ---
    # Escritura pública (reservas, cancelaciones, reseñas): moderado.
    rate_limit_requests: int = 10
    rate_limit_window_seconds: int = 60
    # Acciones sensibles (login, cambio de contraseña, inicio de pago): estricto.
    strict_rate_limit_requests: int = 5
    strict_rate_limit_window_seconds: int = 900  # 15 minutos
    # Lectura pública (disponibilidad, fila, listados): generoso — el wizard
    # consulta varias veces sin ser un ataque; esto solo frena scraping burdo.
    read_rate_limit_requests: int = 120
    read_rate_limit_window_seconds: int = 60
    # Consulta por código (tiquete, estado de pago): las páginas hacen polling,
    # pero sin freno permitirían enumerar códigos de gestión.
    lookup_rate_limit_requests: int = 30
    lookup_rate_limit_window_seconds: int = 60

    # --- Anti fuerza bruta en login (bloqueo TEMPORAL con backoff) ---
    login_max_failures: int = 5           # fallos antes de bloquear
    login_failure_window_minutes: int = 15  # ventana en que se acumulan fallos
    login_lockout_minutes: int = 15       # duración base del bloqueo
    login_lockout_max_minutes: int = 1440  # tope del backoff exponencial (24 h)
    # El nivel de backoff decae si no hay fallos en este lapso
    login_lockout_decay_hours: int = 24

    # --- Anti-bots ---
    # Cloudflare Turnstile: activo solo si hay secret configurado.
    turnstile_secret_key: str = ""
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

    # --- Correos transaccionales (Resend) ---
    # Opt-in por despliegue, igual que Turnstile: sin API key los correos van a
    # un "outbox" local (archivos .html) para desarrollo y demos — nunca se
    # bloquea una reserva por un correo. El código en pantalla sigue siendo el
    # canal oficial del cliente (ADR-009); el correo es cortesía.
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com/emails"
    # El remitente debe ser de un dominio verificado en Resend. Mientras no
    # haya dominio propio, onboarding@resend.dev sirve para pruebas.
    email_from: str = "Will Santoyo <onboarding@resend.dev>"
    email_outbox_dir: str = "./outbox"  # solo se usa sin API key

    @property
    def email_enabled(self) -> bool:
        return bool(self.resend_api_key)

    # --- Detección de ráfagas de reservas (solo registra, no bloquea) ---
    booking_burst_ip_threshold: int = 6      # reservas por IP en la ventana
    booking_burst_phone_threshold: int = 4   # reservas por teléfono en la ventana
    booking_burst_window_minutes: int = 60

    @property
    def turnstile_enabled(self) -> bool:
        return bool(self.turnstile_secret_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def load_aws_secrets() -> None:
    """En Lambda: mezcla los secretos de Secrets Manager en os.environ ANTES de
    instanciar Settings. Idempotente y sin efecto fuera de AWS."""
    prefix = os.environ.get("AWS_SECRETS_PREFIX")
    if not prefix:
        return
    import boto3  # import diferido: no requerido en local

    client = boto3.client("secretsmanager")
    for name in ("app", "database"):
        try:
            value = client.get_secret_value(SecretId=f"{prefix}/{name}")["SecretString"]
        except client.exceptions.ResourceNotFoundException:
            continue
        for key, val in json.loads(value).items():
            os.environ.setdefault(key, val)


@lru_cache
def get_settings() -> Settings:
    load_aws_secrets()
    return Settings()
