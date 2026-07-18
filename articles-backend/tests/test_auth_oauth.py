from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.security import CSRF_COOKIE, SESSION_COOKIE, consume_oauth_state, create_oauth_state


def _new_state(return_to: str = "/console") -> str:
    with SessionLocal() as db:
        return create_oauth_state(db, return_to)


def test_oauth_login_stores_only_a_safe_console_return_path(client: TestClient) -> None:
    response = client.get(
        "/v1/auth/github/login",
        params={"returnTo": "/console/%252e%252e/outside"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
    with SessionLocal() as db:
        assert consume_oauth_state(db, state) == "/console"


def test_oauth_callback_sets_session_and_redirects(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    from app.routers import auth

    async def fake_exchange(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"id": 12345, "login": "ZONGRUICHD", "avatarUrl": None}

    monkeypatch.setattr(auth, "exchange_github_code", fake_exchange)
    state = _new_state("/console/articles/edit/article-id#content")
    response = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "code": "valid-code"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://testserver/console/articles/edit/article-id#content"
    assert SESSION_COOKIE in response.cookies
    assert CSRF_COOKIE in response.cookies


def test_oauth_callback_turns_network_failure_into_safe_console_error(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    from app.routers import auth

    async def fake_exchange(*_args: object, **_kwargs: object) -> dict[str, object]:
        raise HTTPException(status_code=504, detail="upstream timeout with private diagnostics")

    monkeypatch.setattr(auth, "exchange_github_code", fake_exchange)
    state = _new_state("/console/articles/edit/article-id?panel=history#revision")
    response = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "code": "unused-code"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = urlsplit(response.headers["location"])
    assert location.path == "/console/articles/edit/article-id"
    assert parse_qs(location.query) == {"panel": ["history"], "authError": ["github_unavailable"]}
    assert location.fragment == "revision"
    assert "private diagnostics" not in response.headers["location"]

    replay = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "code": "unused-code"},
        follow_redirects=False,
    )
    assert parse_qs(urlsplit(replay.headers["location"]).query) == {"authError": ["state_expired"]}


def test_oauth_callback_handles_cancelled_and_missing_state(client: TestClient) -> None:
    state = _new_state()
    cancelled = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "error": "access_denied"},
        follow_redirects=False,
    )
    assert parse_qs(urlsplit(cancelled.headers["location"]).query) == {"authError": ["access_denied"]}

    missing = client.get("/v1/auth/github/callback", follow_redirects=False)
    assert missing.status_code == 302
    assert parse_qs(urlsplit(missing.headers["location"]).query) == {"authError": ["state_expired"]}
