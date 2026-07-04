"""Fase 3: las fotos colocadas a mano en content/ se indexan en la galería."""
from __future__ import annotations

import os
from pathlib import Path

from app import seed

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcff9fa71e0000060082013f2a2b790000000049454e44ae426082"
)


def test_manual_photos_in_content_are_indexed(client):
    media_root = Path(os.environ["LOCAL_MEDIA_ROOT"])
    target = media_root / "bad-boys" / "gallery" / "fachada-local.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(TINY_PNG)
    # Un archivo que no es imagen debe ignorarse
    (target.parent / "notas.txt").write_text("no soy una foto")

    seed.run()  # idempotente: indexa lo nuevo sin duplicar lo existente

    listed = client.get("/api/v1/public/bad-boys/media", params={"kind": "gallery"}).json()
    urls = [item["url"] for item in listed]
    assert "/media/bad-boys/gallery/fachada-local.png" in urls
    assert not any("notas.txt" in (u or "") for u in urls)

    # Correr el seed otra vez no duplica
    seed.run()
    listed_again = client.get(
        "/api/v1/public/bad-boys/media", params={"kind": "gallery"}
    ).json()
    assert len(listed_again) == len(listed)

    # La imagen se sirve por el mount /media del backend
    served = client.get("/media/bad-boys/gallery/fachada-local.png")
    assert served.status_code == 200
    assert served.content == TINY_PNG
