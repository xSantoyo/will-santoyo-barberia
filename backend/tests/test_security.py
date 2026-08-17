"""Ronda de seguridad (jul-2026): anti fuerza bruta, honeypot, alcance del rol
barbero, cambio de contraseña y registro de eventos de seguridad."""
from __future__ import annotations

from app import seed

from .conftest import next_working_date

BASE = "/api/v1/public/will-barbershop"
ADMIN = "/api/v1/admin"
AUTH = "/api/v1/auth"


def _fail_login(client, username=seed.DEFAULT_ADMIN_USERNAME, password="incorrecta"):
    return client.post(f"{AUTH}/login", json={"username": username, "password": password})


# ---------------------------------------------------------------- fuerza bruta

def test_login_lockout_after_failures(client):
    """5 fallos → bloqueo TEMPORAL (429 + Retry-After), incluso con la clave
    correcta, y el evento queda registrado con IP y usuario."""
    for _ in range(4):
        assert _fail_login(client).status_code == 401
    fifth = _fail_login(client)
    assert fifth.status_code == 429
    assert int(fifth.headers["Retry-After"]) > 0

    # Bloqueado: ni siquiera la contraseña correcta entra (evita seguir sondeando)
    good = client.post(
        f"{AUTH}/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD},
    )
    assert good.status_code == 429


def test_lockout_is_temporary_not_permanent(client, db):
    """El bloqueo expira solo: nadie puede dejar fuera al admin para siempre."""
    from datetime import timedelta

    from sqlalchemy import select

    from app.db import utcnow
    from app.models import LoginThrottle

    for _ in range(5):
        _fail_login(client)
    rows = list(db.scalars(select(LoginThrottle)))
    assert rows and all(r.locked_until is not None for r in rows)

    # Simula que pasaron los 15 minutos (también para el limitador por IP,
    # cuya ventana coincide con la del bloqueo)
    for row in rows:
        row.locked_until = utcnow() - timedelta(seconds=1)
    db.commit()
    from app.deps import login_rate_limiter

    login_rate_limiter._hits.clear()

    good = client.post(
        f"{AUTH}/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD},
    )
    assert good.status_code == 200
    # El éxito limpia contadores y niveles de backoff
    db.expire_all()  # la limpieza ocurrió en la sesión del request
    rows = list(db.scalars(select(LoginThrottle)))
    assert all(r.failures == 0 and r.locked_until is None for r in rows)


def test_failed_logins_are_recorded(client, admin_headers):
    _fail_login(client, username=seed.DEFAULT_ADMIN_USERNAME)
    events = client.get(
        f"{ADMIN}/security-events?kind=login_failed", headers=admin_headers
    ).json()
    assert events, "el intento fallido debe quedar registrado"
    assert events[0]["username"] == seed.DEFAULT_ADMIN_USERNAME
    assert events[0]["ip"]
    assert events[0]["created_at"]


def test_login_honeypot(client, admin_headers):
    response = client.post(
        f"{AUTH}/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD,
              "website": "http://spam.example.com"},
    )
    assert response.status_code == 401  # misma respuesta que credenciales malas
    events = client.get(
        f"{ADMIN}/security-events?kind=honeypot", headers=admin_headers
    ).json()
    assert any(e["detail"].get("form") == "login" for e in events)


def test_booking_honeypot(client, professional, admin_headers):
    services = client.get(f"{BASE}/services").json()
    day = next_working_date(professional, weeks_ahead=30)
    response = client.post(
        f"{BASE}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": "09:00",
            "customer_name": "Robot Spam", "customer_whatsapp": "3170009999",
            "website": "http://spam.example.com",
        },
    )
    assert response.status_code == 400
    events = client.get(
        f"{ADMIN}/security-events?kind=honeypot", headers=admin_headers
    ).json()
    assert any(e["detail"].get("form") == "booking" for e in events)


# ---------------------------------------------------------------- contraseña

def test_change_password_flow(client, db, tenant):
    """Sobre una cuenta desechable: cambiar la clave de la de Will contaminaría
    al resto de la suite."""
    from app.models import AdminUser
    from app.security import hash_password

    db.add(
        AdminUser(
            tenant_id=tenant.id,
            username="temporal",
            password_hash=hash_password(seed.DEFAULT_ADMIN_PASSWORD),
            role="admin",
        )
    )
    db.commit()

    login = client.post(
        f"{AUTH}/login",
        json={"username": "temporal", "password": seed.DEFAULT_ADMIN_PASSWORD},
    ).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}

    # Contraseña actual incorrecta → 401
    assert client.post(
        f"{AUTH}/change-password",
        json={"current_password": "nope", "new_password": "NuevaClave2026"},
        headers=headers,
    ).status_code == 401

    # Débil (sin números / corta) → 422
    assert client.post(
        f"{AUTH}/change-password",
        json={"current_password": seed.DEFAULT_ADMIN_PASSWORD, "new_password": "corta1"},
        headers=headers,
    ).status_code == 422

    # Cambio correcto → el refresh token viejo queda revocado
    changed = client.post(
        f"{AUTH}/change-password",
        json={"current_password": seed.DEFAULT_ADMIN_PASSWORD,
              "new_password": "NuevaClave2026"},
        headers=headers,
    )
    assert changed.status_code == 200
    assert client.post(
        f"{AUTH}/refresh", json={"refresh_token": login["refresh_token"]}
    ).status_code == 401

    # La clave nueva sirve; la vieja no. Se restaura al final para no
    # contaminar el resto de la suite.
    assert _fail_login(client, "temporal", seed.DEFAULT_ADMIN_PASSWORD).status_code == 401
    relogin = client.post(
        f"{AUTH}/login", json={"username": "temporal", "password": "NuevaClave2026"}
    )
    assert relogin.status_code == 200
    restore = client.post(
        f"{AUTH}/change-password",
        json={"current_password": "NuevaClave2026",
              "new_password": seed.DEFAULT_ADMIN_PASSWORD},
        headers={"Authorization": f"Bearer {relogin.json()['access_token']}"},
    )
    assert restore.status_code == 200


# ---------------------------------------------------------------- rol barbero

def _manual_booking(client, admin_headers, professional, day, time, phone, name):
    services = client.get(f"{BASE}/services").json()
    response = client.post(
        f"{ADMIN}/appointments",
        json={
            "service_ids": [services[0]["id"]],
            "date": day.isoformat(), "time": time,
            "customer_name": name, "customer_whatsapp": phone,
        },
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_manage_code_is_long_and_random(client, admin_headers, professional):
    day = next_working_date(professional, weeks_ahead=33)
    booked = _manual_booking(client, admin_headers, professional, day, "11:00",
                             "3175550004", "Cliente Código")
    assert len(booked["manage_code"]) == 8
    # Alfabeto sin ambiguos: nunca 0/O/1/I/L
    assert not set(booked["manage_code"]) & set("0O1IL")


# ---------------------------------------------------------------- ráfagas

def test_booking_burst_is_logged(client, admin_headers, professional):
    """Varias reservas con el mismo teléfono en poco tiempo generan un evento
    booking_burst (registro, no bloqueo: el freno duro es el rate limiter)."""
    services = client.get(f"{BASE}/services").json()
    phone = "3175550100"
    day = next_working_date(professional, weeks_ahead=34)
    times = ["09:00", "10:00", "11:00", "12:00"]
    for time in times:
        response = client.post(
            f"{BASE}/appointments",
            json={
                "service_ids": [services[0]["id"]],
                "date": day.isoformat(), "time": time,
                "customer_name": "Cliente Ráfaga", "customer_whatsapp": phone,
            },
        )
        assert response.status_code == 201, response.text

    events = client.get(
        f"{ADMIN}/security-events?kind=booking_burst", headers=admin_headers
    ).json()
    assert any(e["detail"].get("phone") == "+573175550100" for e in events)
