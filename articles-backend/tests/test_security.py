from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import SessionLocal
from app.security import consume_oauth_state, create_oauth_state, exchange_github_code, verify_turnstile


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self.payload


class FakeGitHubClient:
    user: dict[str, object] = {"id": 12345, "login": "ZONGRUICHD", "avatar_url": "https://example.test/a.png"}

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> FakeGitHubClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, *_args: object, **_kwargs: object) -> FakeResponse:
        return FakeResponse({"access_token": "github-token"})

    async def get(self, *_args: object, **_kwargs: object) -> FakeResponse:
        return FakeResponse(self.user)


class FakeTurnstileClient:
    payload: dict[str, object] = {
        "success": True,
        "hostname": "testserver",
        "action": "turnstile-spin-v1",
    }

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> FakeTurnstileClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, *_args: object, **_kwargs: object) -> FakeResponse:
        return FakeResponse(self.payload)


def test_oauth_state_is_single_use() -> None:
    with SessionLocal() as db:
        raw = create_oauth_state(db, "/articles/console/edit/abc")
        assert consume_oauth_state(db, raw) == "/articles/console/edit/abc"
        with pytest.raises(HTTPException) as caught:
            consume_oauth_state(db, raw)
        assert caught.value.status_code == 400


def test_github_numeric_id_is_authoritative(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import security

    monkeypatch.setattr(security.httpx, "AsyncClient", FakeGitHubClient)
    user = asyncio.run(exchange_github_code(get_settings(), "oauth-code"))
    assert user["id"] == 12345

    FakeGitHubClient.user = {"id": 12345, "login": "RENAMED-ADMIN"}
    renamed_user = asyncio.run(exchange_github_code(get_settings(), "oauth-code"))
    assert renamed_user["login"] == "RENAMED-ADMIN"

    FakeGitHubClient.user = {"id": 54321, "login": "ZONGRUICHD"}
    try:
        with pytest.raises(HTTPException) as caught:
            asyncio.run(exchange_github_code(get_settings(), "oauth-code"))
        assert caught.value.status_code == 403
    finally:
        FakeGitHubClient.user = {"id": 12345, "login": "ZONGRUICHD"}


def test_optional_origin_token_and_media_host_boundary(client: TestClient) -> None:
    settings = get_settings()
    previous = settings.origin_shared_secret
    settings.origin_shared_secret = "a" * 32
    try:
        assert client.get("/v1/articles").status_code == 404
        allowed = client.get("/v1/articles", headers={"X-ZR-Origin-Token": "a" * 32})
        assert allowed.status_code == 200

        assert client.get("/health", headers={"Host": "media.example.test"}).status_code == 404
        assert client.get("/v1/articles", headers={"Host": "media.example.test"}).status_code == 404
        media_post = client.post("/media/2026/01/missing.webp", headers={"Host": "media.example.test"})
        assert media_post.status_code == 405
        assert media_post.headers["allow"] == "GET, HEAD"
    finally:
        settings.origin_shared_secret = previous


def test_turnstile_hostname_and_action_are_required(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import security

    settings = get_settings()
    previous_bypass = settings.turnstile_bypass
    settings.turnstile_bypass = False
    monkeypatch.setattr(security.httpx, "AsyncClient", FakeTurnstileClient)
    try:
        asyncio.run(verify_turnstile("token", "127.0.0.1", settings))
        FakeTurnstileClient.payload = {
            "success": True,
            "hostname": "testserver",
            "action": "wrong-action",
        }
        with pytest.raises(HTTPException) as caught:
            asyncio.run(verify_turnstile("token", "127.0.0.1", settings))
        assert caught.value.status_code == 400
        assert "action" in str(caught.value.detail).lower()
    finally:
        FakeTurnstileClient.payload = {
            "success": True,
            "hostname": "testserver",
            "action": "turnstile-spin-v1",
        }
        settings.turnstile_bypass = previous_bypass
