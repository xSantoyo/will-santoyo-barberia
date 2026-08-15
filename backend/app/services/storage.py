"""Almacenamiento de imágenes con dos backends intercambiables.

- local: escribe bajo `content/` y el propio backend sirve /media/* (desarrollo).
- s3: genera presigned POST para subir directo desde el navegador del admin
  (las imágenes nunca pasan por Lambda) y sirve vía CloudFront (producción).

Formato de key unificado: tenants/<slug>/<kind_dir>/<uuid><ext>
"""
from __future__ import annotations

import uuid
from pathlib import Path

from ..config import get_settings

KIND_DIRS = {"gallery": "gallery", "profile": "profile", "cut": "cuts", "product": "products"}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def sniff_image_content_type(content: bytes) -> str | None:
    """Detecta el tipo real de imagen por magic bytes (el Content-Type del
    request lo declara el cliente y no es confiable). Devuelve None si el
    contenido no es ninguno de los formatos permitidos."""
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    # ISO-BMFF: los AVIF llevan la caja ftyp con brand avif/avis
    if content[4:8] == b"ftyp" and content[8:12] in (b"avif", b"avis"):
        return "image/avif"
    return None


def make_key(tenant_slug: str, kind: str, content_type: str) -> str:
    ext = ALLOWED_CONTENT_TYPES[content_type]
    return f"tenants/{tenant_slug}/{KIND_DIRS[kind]}/{uuid.uuid4().hex}{ext}"


class LocalStorage:
    """Guarda en LOCAL_MEDIA_ROOT (content/ en docker-compose) y sirve /media/*."""

    def __init__(self) -> None:
        self.root = Path(get_settings().local_media_root)

    def _path_for(self, key: str) -> Path:
        relative = key.removeprefix("tenants/")
        path = (self.root / relative).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Key de almacenamiento inválida")
        return path

    def save(self, key: str, content: bytes) -> None:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def delete(self, key: str) -> None:
        path = self._path_for(key)
        path.unlink(missing_ok=True)

    def public_url(self, key: str) -> str:
        return f"/media/{key.removeprefix('tenants/')}"

    upload_mode = "direct"  # el navegador sube al backend (multipart)


class S3Storage:
    upload_mode = "presigned"  # el navegador sube directo a S3

    def __init__(self) -> None:
        import boto3

        settings = get_settings()
        self.bucket = settings.s3_bucket
        self.cdn_base = settings.cdn_base_url.rstrip("/")
        self.client = boto3.client("s3", region_name=settings.aws_region)

    def presign_post(self, key: str, content_type: str) -> dict:
        return self.client.generate_presigned_post(
            Bucket=self.bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, MAX_UPLOAD_BYTES],
            ],
            ExpiresIn=600,
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def public_url(self, key: str) -> str:
        return f"{self.cdn_base}/{key}"


def get_storage():
    if get_settings().storage_backend == "s3":
        return S3Storage()
    return LocalStorage()
