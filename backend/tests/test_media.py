"""Galería de imágenes: subida sin tocar código ni consola (backend local)."""
from __future__ import annotations

import io

ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1/public/will-barbershop"

# PNG mínimo válido (1x1 transparente)
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcff9fa71e0000060082013f2a2b790000000049454e44ae426082"
)


def test_presign_contract_local_mode(client, admin_headers):
    response = client.post(
        f"{ADMIN}/media/presign",
        json={"kind": "gallery", "filename": "local.jpg", "content_type": "image/jpeg"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "direct"  # backend local: subida multipart al backend
    assert data["key"].startswith("tenants/will-barbershop/gallery/")


def test_upload_list_and_delete(client, admin_headers):
    upload = client.post(
        f"{ADMIN}/media/upload",
        data={"kind": "cut"},
        files={"file": ("corte.png", io.BytesIO(TINY_PNG), "image/png")},
        headers=admin_headers,
    )
    assert upload.status_code == 201, upload.text
    asset = upload.json()
    assert asset["kind"] == "cut"
    assert asset["url"].startswith("/media/will-barbershop/cuts/")

    # La imagen servida por el backend responde 200
    served = client.get(asset["url"])
    assert served.status_code == 200
    assert served.content == TINY_PNG

    # Aparece en el listado público (para el sitio web)
    public = client.get(f"{PUBLIC}/media", params={"kind": "cut"}).json()
    assert any(item["id"] == asset["id"] for item in public)

    # Eliminar
    deleted = client.delete(f"{ADMIN}/media/{asset['id']}", headers=admin_headers)
    assert deleted.status_code == 204
    public = client.get(f"{PUBLIC}/media", params={"kind": "cut"}).json()
    assert not any(item["id"] == asset["id"] for item in public)


def test_upload_rejects_bad_type_and_kind(client, admin_headers):
    bad_type = client.post(
        f"{ADMIN}/media/upload",
        data={"kind": "gallery"},
        files={"file": ("virus.exe", io.BytesIO(b"MZ..."), "application/octet-stream")},
        headers=admin_headers,
    )
    assert bad_type.status_code == 415

    bad_kind = client.post(
        f"{ADMIN}/media/upload",
        data={"kind": "loquesea"},
        files={"file": ("foto.png", io.BytesIO(TINY_PNG), "image/png")},
        headers=admin_headers,
    )
    assert bad_kind.status_code == 400


