from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.security import CSRF_COOKIE, SESSION_COOKIE, create_oauth_state


def _new_state(return_to: str = "/articles/console") -> str:
    with SessionLocal() as db:
        return create_oauth_state(db, return_to)


def test_oauth_callback_sets_session_and_redirects(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    from app.routers import auth

    async def fake_exchange(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"id": 12345, "login": "ZONGRUICHD", "avatarUrl": None}

    monkeypatch.setattr(auth, "exchange_github_code", fake_exchange)
    state = _new_state("/articles/console/edit/article-id#content")
    response = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "code": "valid-code"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://testserver/articles/console/edit/article-id#content"
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
    state = _new_state("/articles/console/edit/article-id?panel=history#revision")
    response = client.get(
        "/v1/auth/github/callback",
        params={"state": state, "code": "unused-code"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = urlsplit(response.headers["location"])
    assert location.path == "/articles/console/edit/article-id"
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
