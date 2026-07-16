from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .config import Settings
from .database import get_db
from .models import AdminSession, OAuthState


SESSION_COOKIE = "zr_articles_session"
CSRF_COOKIE = "zr_articles_csrf"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def safe_return_to(value: str | None) -> str:
    if value and value.startswith("/articles/console") and not value.startswith("//") and "\r" not in value and "\n" not in value:
        return value[:255]
    return "/articles/console"


def create_oauth_state(db: Session, return_to: str) -> str:
    now = utc_now()
    db.execute(delete(OAuthState).where(OAuthState.expires_at < now))
    raw = secrets.token_urlsafe(32)
    db.add(
        OAuthState(
            state_hash=token_hash(raw),
            return_to=safe_return_to(return_to),
            expires_at=now + timedelta(minutes=10),
        )
    )
    db.commit()
    return raw


def consume_oauth_state(db: Session, raw: str) -> str:
    state = db.get(OAuthState, token_hash(raw))
    if state is None or ensure_aware(state.expires_at) <= utc_now():
        raise HTTPException(status_code=400, detail="invalid or expired OAuth state")
    return_to = state.return_to
    db.delete(state)
    db.commit()
    return return_to


def github_authorize_url(settings: Settings, state: str) -> str:
    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.oauth_callback_url,
            "scope": "read:user",
            "state": state,
        }
    )
    return f"https://github.com/login/oauth/authorize?{query}"


async def exchange_github_code(settings: Settings, code: str) -> dict[str, object]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json", "User-Agent": "zongrui-articles/1.0"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": settings.oauth_callback_url,
                },
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise HTTPException(status_code=401, detail="GitHub OAuth exchange failed")
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {access_token}",
                    "User-Agent": "zongrui-articles/1.0",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            user_response.raise_for_status()
            user = user_response.json()
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="GitHub OAuth is temporarily unavailable") from exc
    user_id = user.get("id")
    login = user.get("login")
    if not isinstance(user_id, int) or not isinstance(login, str):
        raise HTTPException(status_code=401, detail="GitHub user response is invalid")
    if user_id != settings.admin_github_user_id or login.casefold() != settings.admin_github_login.casefold():
        raise HTTPException(status_code=403, detail="this GitHub account is not an administrator")
    return {"id": user_id, "login": login, "avatarUrl": user.get("avatar_url")}


def create_admin_session(db: Session, user_id: int, login: str, settings: Settings) -> tuple[str, str]:
    now = utc_now()
    db.execute(delete(AdminSession).where(AdminSession.expires_at < now))
    session_token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    db.add(
        AdminSession(
            token_hash=token_hash(session_token),
            csrf_hash=token_hash(csrf_token),
            github_user_id=user_id,
            github_login=login,
            expires_at=now + timedelta(days=settings.session_days),
        )
    )
    db.commit()
    return session_token, csrf_token


def get_admin_session(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> AdminSession:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="administrator login required")
    session = db.get(AdminSession, token_hash(session_token))
    if session is None or ensure_aware(session.expires_at) <= utc_now():
        if session is not None:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired")
    session.last_seen_at = utc_now()
    db.commit()
    return session


def require_csrf(
    admin_session: AdminSession = Depends(get_admin_session),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AdminSession:
    if not csrf_token or not hmac.compare_digest(token_hash(csrf_token), admin_session.csrf_hash):
        raise HTTPException(status_code=403, detail="invalid CSRF token")
    return admin_session


def rotate_csrf(db: Session, session: AdminSession) -> str:
    raw = secrets.token_urlsafe(32)
    session.csrf_hash = token_hash(raw)
    db.commit()
    return raw


def client_address(request: Request, settings: Settings) -> str:
    if settings.trust_proxy_headers:
        for header_name in ("X-ZR-Visitor-IP", "CF-Connecting-IP"):
            value = request.headers.get(header_name, "").strip()
            if value and len(value) <= 64:
                return value
    return request.client.host if request.client else "unknown"


def daily_source_hash(address: str, settings: Settings, now: datetime | None = None) -> str:
    now = now or utc_now()
    daily_key = hmac.new(settings.rate_limit_secret.encode(), now.date().isoformat().encode(), hashlib.sha256).digest()
    return hmac.new(daily_key, address.encode(), hashlib.sha256).hexdigest()


async def verify_turnstile(token: str, address: str, settings: Settings) -> None:
    if settings.turnstile_bypass:
        return
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": settings.turnstile_secret, "response": token, "remoteip": address},
            )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Turnstile verification is temporarily unavailable") from exc
    if response.status_code != 200 or payload.get("success") is not True:
        raise HTTPException(status_code=400, detail="Turnstile verification failed")
    expected_hostname = urlparse(settings.public_base_url).hostname
    verified_hostname = payload.get("hostname")
    if expected_hostname not in {"localhost", "127.0.0.1"} and verified_hostname != expected_hostname:
        raise HTTPException(status_code=400, detail="Turnstile hostname did not match")
    if payload.get("action") != settings.turnstile_action:
        raise HTTPException(status_code=400, detail="Turnstile action did not match")
