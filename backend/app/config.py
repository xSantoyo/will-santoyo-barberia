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
    slot_step_minutes: int = 15         # granularidad de la grilla de horarios
    booking_lead_minutes: int = 30      # antelación mínima para reservar
    booking_horizon_days: int = 30      # hasta cuántos días adelante se puede reservar
    no_show_grace_minutes: int = 15     # tolerancia antes de alertar no-show

    # --- Rate limiting (endpoints públicos) ---
    rate_limit_requests: int = 10
    rate_limit_window_seconds: int = 60

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
