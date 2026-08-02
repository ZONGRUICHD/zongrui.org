from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import AuditLog, DEFAULT_SITE_BIO, SiteProfile


def test_public_profile_uses_confirmed_default(client: TestClient) -> None:
    response = client.get("/api/articles/v1/profile")

    assert response.status_code == 200
    assert response.json()["profile"]["bio"] == DEFAULT_SITE_BIO
    assert response.json()["profile"]["updatedAt"]
    assert response.headers["cache-control"].startswith("public")

    with SessionLocal() as db:
        assert db.get(SiteProfile, 1) is not None


def test_admin_can_update_profile(admin_client: TestClient) -> None:
    response = admin_client.put(
        "/api/articles/v1/admin/profile",
        json={"bio": "  我写 Rust，也折腾机器人。  "},
    )

    assert response.status_code == 200
    assert response.json()["profile"]["bio"] == "我写 Rust，也折腾机器人。"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-zr-cache-invalidate"] == "/v1/profile,/"
    assert admin_client.get("/api/articles/v1/profile").json()["profile"]["bio"] == "我写 Rust，也折腾机器人。"

    with SessionLocal() as db:
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "site_profile.update"))
        assert audit is not None
        assert "我写" not in audit.details_json


def test_profile_admin_requires_session(client: TestClient) -> None:
    assert client.get("/api/articles/v1/admin/profile").status_code == 401


def test_profile_update_requires_csrf(admin_client: TestClient) -> None:
    csrf = admin_client.headers.pop("X-CSRF-Token")
    try:
        assert admin_client.put("/api/articles/v1/admin/profile", json={"bio": "测试简介"}).status_code == 403
    finally:
        admin_client.headers["X-CSRF-Token"] = csrf


def test_profile_rejects_blank_and_overlong_text(admin_client: TestClient) -> None:
    assert admin_client.put("/api/articles/v1/admin/profile", json={"bio": "  "}).status_code == 422
    assert admin_client.put("/api/articles/v1/admin/profile", json={"bio": "字" * 321}).status_code == 422
