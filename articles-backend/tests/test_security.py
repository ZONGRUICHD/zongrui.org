from __future__ import annotations

import asyncio

import httpx
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


class FakeRelayResponse(FakeResponse):
    def __init__(self, payload: dict[str, object], status_code: int = 200) -> None:
        super().__init__(payload)
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code < 400:
            return
        request = httpx.Request("POST", "https://relay.example.test/exchange")
        response = httpx.Response(self.status_code, request=request)
        raise httpx.HTTPStatusError("relay failed", request=request, response=response)


class FakeRelayClient:
    response = FakeRelayResponse(
        {"id": 12345, "login": "ZONGRUICHD", "avatarUrl": "https://example.test/a.png"}
    )
    init_kwargs: dict[str, object] = {}
    post_calls: list[tuple[str, dict[str, object]]] = []

    def __init__(self, **kwargs: object) -> None:
        type(self).init_kwargs = kwargs

    async def __aenter__(self) -> FakeRelayClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, url: str, **kwargs: object) -> FakeRelayResponse:
        type(self).post_calls.append((url, kwargs))
        return type(self).response


def relay_settings():
    return get_settings().model_copy(
        update={
            "github_exchange_relay_url": "https://relay.example.test/exchange",
            "origin_shared_secret": "relay-origin-secret-with-at-least-32-bytes",
        }
    )


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


def test_github_exchange_relay_success(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import security

    settings = relay_settings()
    FakeRelayClient.response = FakeRelayResponse(
        {"id": 12345, "login": "RENAMED-ADMIN", "avatarUrl": "https://example.test/new.png"}
    )
    FakeRelayClient.post_calls = []
    monkeypatch.setattr(security.httpx, "AsyncClient", FakeRelayClient)

    user = asyncio.run(exchange_github_code(settings, "oauth-code"))

    assert user == {
        "id": 12345,
        "login": "RENAMED-ADMIN",
        "avatarUrl": "https://example.test/new.png",
    }
    assert FakeRelayClient.init_kwargs["trust_env"] is False
    assert len(FakeRelayClient.post_calls) == 1
    relay_url, relay_request = FakeRelayClient.post_calls[0]
    assert relay_url == "https://relay.example.test/exchange"
    assert relay_request["headers"]["X-ZR-Origin-Token"] == settings.origin_shared_secret
    assert relay_request["json"] == {
        "clientId": settings.github_client_id,
        "clientSecret": settings.github_client_secret,
        "code": "oauth-code",
        "redirectUri": settings.oauth_callback_url,
    }


def test_github_exchange_relay_rejects_invalid_code_without_echoing_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import security

    settings = relay_settings()
    FakeRelayClient.response = FakeRelayResponse(
        {"error": {"code": "github_oauth_exchange_failed"}},
        status_code=401,
    )
    FakeRelayClient.post_calls = []
    monkeypatch.setattr(security.httpx, "AsyncClient", FakeRelayClient)

    with pytest.raises(HTTPException) as caught:
        asyncio.run(exchange_github_code(settings, "sensitive-oauth-code"))

    assert caught.value.status_code == 401
    rendered_error = str(caught.value.detail)
    assert rendered_error == "GitHub OAuth exchange failed"
    assert "sensitive-oauth-code" not in rendered_error
    assert settings.github_client_secret not in rendered_error
    assert settings.origin_shared_secret not in rendered_error


def test_github_exchange_relay_does_not_return_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import security

    settings = relay_settings()
    FakeRelayClient.response = FakeRelayResponse(
        {
            "id": 12345,
            "login": "ZONGRUICHD",
            "avatarUrl": None,
            "access_token": "must-never-leave-the-relay",
        }
    )
    FakeRelayClient.post_calls = []
    monkeypatch.setattr(security.httpx, "AsyncClient", FakeRelayClient)

    user = asyncio.run(exchange_github_code(settings, "oauth-code"))

    assert user == {"id": 12345, "login": "ZONGRUICHD", "avatarUrl": None}
    assert "access_token" not in user
    assert "must-never-leave-the-relay" not in repr(user)


def test_optional_origin_token_and_media_host_boundary(client: TestClient) -> None:
    settings = get_settings()
    previous = settings.origin_shared_secret
    settings.origin_shared_secret = "a" * 32
    try:
        assert client.get("/v1/articles").status_code == 404
        allowed = client.get("/v1/articles", headers={"X-ZR-Origin-Token": "a" * 32})
        assert allowed.status_code == 200

        media_health = client.get("/health", headers={"Host": "media.example.test"})
        assert media_health.status_code == 404
        assert media_health.headers["strict-transport-security"] == "max-age=31536000"
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
