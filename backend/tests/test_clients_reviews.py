"""Tanda 3: portal por teléfono, fidelidad, reseñas verificadas y notas de estilo."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.db import SessionLocal
from app.models import Appointment

BASE = "/api/v1/public/will-barbershop"
ADMIN = "/api/v1/admin"
PHONE = "+573159990001"  # exclusivo de esta suite


def _make(db, tenant, professional, *, days_ago, status, name="Cliente Memoria"):
    starts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    appointment = Appointment(
        tenant_id=tenant.id,
        professional_id=professional.id,
        customer_name=name,
        customer_whatsapp=PHONE,
        starts_at=starts,
        ends_at=starts + timedelta(minutes=45),
        status=status,
        daily_number=1,
        manage_code=uuid.uuid4().hex[:8].upper(),
    )
    db.add(appointment)
    return appointment


@pytest.fixture()
def client_history(tenant, professional):
    db = SessionLocal()
    rows = [
        _make(db, tenant, professional, days_ago=60, status="completado"),
        _make(db, tenant, professional, days_ago=30, status="completado"),
        _make(db, tenant, professional, days_ago=15, status="completado",
              name="Cliente Memoria Pérez"),
        _make(db, tenant, professional, days_ago=10, status="cancelado"),
        _make(db, tenant, professional, days_ago=-30, status="confirmado"),  # futuro
    ]
    db.commit()
    codes = [r.manage_code for r in rows]
    yield codes
    for row in rows:
        if row.review:
            db.delete(row.review)
        db.delete(row)
    db.commit()
    db.close()


def test_portal_requires_matching_pair(client, client_history):
    wrong = client.post(
        f"{BASE}/portal",
        json={"customer_whatsapp": "+573159990009", "manage_code": client_history[0]},
    )
    assert wrong.status_code == 404


def test_portal_history_and_loyalty(client, client_history):
    portal = client.post(
        f"{BASE}/portal",
        json={"customer_whatsapp": PHONE, "manage_code": client_history[0]},
    )
    assert portal.status_code == 200, portal.text
    data = portal.json()
    assert len(data["appointments"]) == 5
    loyalty = data["loyalty"]
    assert loyalty["completed_count"] == 3
    assert loyalty["target"] == 10
    assert loyalty["remaining"] == 7
    assert loyalty["earned_rewards"] == 0
    # El completado sin reseña invita a reseñar
    done = [a for a in data["appointments"] if a["status"] == "completado"]
    assert all(a["can_review"] for a in done)


def test_verified_reviews_flow(client, admin_headers, client_history, professional):
    completed_code, future_code = client_history[0], client_history[4]

    # Solo citas completadas pueden reseñar
    early = client.post(
        f"{BASE}/appointments/{future_code}/review", json={"rating": 5}
    )
    assert early.status_code == 409

    created = client.post(
        f"{BASE}/appointments/{completed_code}/review",
        json={"rating": 5, "comment": "El fade quedó impecable."},
    )
    assert created.status_code == 201, created.text
    review = created.json()
    assert review["rating"] == 5
    assert review["customer_label"] == "Cliente M."  # nombre abreviado: privacidad

    # Una reseña por cita
    duplicate = client.post(
        f"{BASE}/appointments/{completed_code}/review", json={"rating": 4}
    )
    assert duplicate.status_code == 409

    # Rating fuera de rango → validación
    assert client.post(
        f"{BASE}/appointments/{client_history[1]}/review", json={"rating": 6}
    ).status_code == 422

    # PENDIENTE de aprobación: no sale al público todavía
    listing = client.get(f"{BASE}/reviews").json()
    assert not any(
        "impecable" in (item["comment"] or "") for item in listing["items"]
    ), "una reseña sin aprobar no puede aparecer en el sitio"

    # Will la ve en su bandeja de pendientes
    pendientes = client.get(
        f"{ADMIN}/reviews?pending_only=true", headers=admin_headers
    ).json()
    mia = next(r for r in pendientes if r["comment"] == "El fade quedó impecable.")
    assert mia["is_public"] is False

    # La aprueba, y recién entonces se publica
    aprobada = client.patch(
        f"{ADMIN}/reviews/{mia['id']}", json={"is_public": True}, headers=admin_headers
    )
    assert aprobada.status_code == 200
    listing = client.get(f"{BASE}/reviews").json()
    assert listing["overall"]["count"] >= 1
    assert listing["overall"]["average"] is not None
    assert any("impecable" in (item["comment"] or "") for item in listing["items"])

    # Y puede retirarla si se arrepiente
    client.patch(
        f"{ADMIN}/reviews/{mia['id']}", json={"is_public": False}, headers=admin_headers
    )
    assert not any(
        "impecable" in (item["comment"] or "")
        for item in client.get(f"{BASE}/reviews").json()["items"]
    )
    client.patch(
        f"{ADMIN}/reviews/{mia['id']}", json={"is_public": True}, headers=admin_headers
    )

    # El tiquete refleja la reseña dejada
    ticket = client.get(f"{BASE}/appointments/{completed_code}").json()
    assert ticket["review_rating"] == 5
    assert ticket["can_review"] is False

    # B5: la reseña suma una tijera en la fidelidad
    portal = client.post(
        f"{BASE}/portal",
        json={"customer_whatsapp": PHONE, "manage_code": completed_code},
    ).json()
    assert portal["loyalty"]["review_bonus"] == 1
    assert portal["loyalty"]["progress"] == 4  # 3 cortes + 1 reseña


def test_style_notes_and_profile(client, admin_headers, client_history, professional):
    # Will deja una nota de estilo
    created = client.post(
        f"{ADMIN}/clients/{PHONE}/notes",
        json={"note": "Máquina 2 a los lados, tijera arriba. No le gusta la navaja."},
        headers=admin_headers,
    )
    assert created.status_code == 201
    admin_note_id = created.json()["id"]

    # El perfil trae stats, notas y fidelidad
    profile = client.get(f"{ADMIN}/clients/{PHONE}", headers=admin_headers).json()
    assert profile["stats"]["completed_count"] == 3
    assert profile["stats"]["no_show_count"] == 0
    assert any("Máquina 2" in n["note"] for n in profile["notes"])
    assert profile["loyalty"]["completed_count"] == 3
    assert len(profile["recent"]) == 5

    own = client.post(
        f"{ADMIN}/clients/{PHONE}/notes",
        json={"note": "Prefiere cita temprano."},
        headers=admin_headers,
    )
    assert own.status_code == 201
    assert client.delete(
        f"{ADMIN}/client-notes/{own.json()['id']}", headers=admin_headers
    ).status_code == 204
    assert client.delete(
        f"{ADMIN}/client-notes/{admin_note_id}", headers=admin_headers
    ).status_code == 204

    # Teléfono inválido → 400
    assert client.get(f"{ADMIN}/clients/abc", headers=admin_headers).status_code == 400
