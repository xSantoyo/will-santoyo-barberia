"""Autenticación: login, refresh, protección de rutas y roles."""
from __future__ import annotations

from app import seed


def test_login_ok(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "admin"
    assert data["access_token"] and data["refresh_token"]


def test_login_with_tenant_slug(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD,
              "tenant_slug": "will-barbershop"},
    )
    assert response.status_code == 200


def test_login_wrong_password(client):
    response = client.post(
        "/api/v1/auth/login", json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": "incorrecta"}
    )
    assert response.status_code == 401


def test_login_unknown_user(client):
    response = client.post(
        "/api/v1/auth/login", json={"username": "fantasma", "password": "loquesea"}
    )
    assert response.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/api/v1/admin/dashboard").status_code == 401
    assert client.get(
        "/api/v1/admin/dashboard", headers={"Authorization": "Bearer basura"}
    ).status_code == 401


def test_refresh_flow(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"username": seed.DEFAULT_ADMIN_USERNAME, "password": seed.DEFAULT_ADMIN_PASSWORD},
    ).json()
    response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert response.status_code == 200
    assert response.json()["access_token"]

    # Un access token NO sirve como refresh token
    response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login["access_token"]}
    )
    assert response.status_code == 401


