from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlencode, urlparse, urlsplit

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


DEFAULT_CONSOLE_PATH = "/console"
_CONSOLE_PATH_PREFIXES = (DEFAULT_CONSOLE_PATH, "/articles/console")


def safe_return_to(value: str | None) -> str:
    """Keep OAuth redirects on a known Console route on this origin.

    The old ``/articles/console`` namespace remains accepted while bookmarks
    and in-flight OAuth states migrate to the unified ``/console``. Validation
    is deliberately stricter than a prefix check because browsers normalize
    dot segments and encoded control characters before navigation.
    """

    if not value or len(value) > 255 or value.startswith("//") or "\\" in value:
        return DEFAULT_CONSOLE_PATH

    decoded = value
    for _ in range(3):
        next_decoded = unquote(decoded)
        if next_decoded == decoded:
            break
        decoded = next_decoded

    if "\\" in decoded or decoded.startswith("//"):
        return DEFAULT_CONSOLE_PATH
    if any(ord(character) < 32 or ord(character) == 127 for character in decoded):
        return DEFAULT_CONSOLE_PATH

    parsed = urlsplit(decoded)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/"):
        return DEFAULT_CONSOLE_PATH
    if any(segment in {".", ".."} for segment in parsed.path.split("/")):
        return DEFAULT_CONSOLE_PATH

    allowed = any(
        parsed.path == prefix or parsed.path.startswith(f"{prefix}/")
        for prefix in _CONSOLE_PATH_PREFIXES
    )
    return value if allowed else DEFAULT_CONSOLE_PATH


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


async def _exchange_github_user(settings: Settings, code: str) -> object:
    timeout = httpx.Timeout(10.0, connect=4.0, read=8.0, write=4.0, pool=2.0)
    relay_url = settings.oauth_exchange_relay_url
    async with httpx.AsyncClient(timeout=timeout, trust_env=not bool(relay_url)) as client:
        if relay_url:
            relay_response = await client.post(
                relay_url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "zongrui-articles/1.0",
                    "X-ZR-Origin-Token": settings.origin_shared_secret,
                },
                json={
                    "clientId": settings.github_client_id,
                    "clientSecret": settings.github_client_secret,
                    "code": code,
                    "redirectUri": settings.oauth_callback_url,
                },
            )
            if relay_response.status_code in {400, 401}:
                raise HTTPException(status_code=401, detail="GitHub OAuth exchange failed")
            relay_response.raise_for_status()
            return relay_response.json()

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
        token_payload = token_response.json()
        access_token = token_payload.get("access_token") if isinstance(token_payload, dict) else None
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
        return user_response.json()


async def exchange_github_code(settings: Settings, code: str) -> dict[str, object]:
    try:
        async with asyncio.timeout(12.0):
            user = await _exchange_github_user(settings, code)
    except HTTPException:
        raise
    except (httpx.TimeoutException, TimeoutError) as exc:
        raise HTTPException(status_code=504, detail="GitHub OAuth exchange timed out") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="GitHub OAuth is temporarily unavailable") from exc
    if not isinstance(user, dict):
        raise HTTPException(status_code=502, detail="GitHub user response is invalid")
    user_id = user.get("id")
    login = user.get("login")
    if not isinstance(user_id, int) or not isinstance(login, str):
        raise HTTPException(status_code=401, detail="GitHub user response is invalid")
    # GitHub's numeric user ID is stable across login renames and is the
    # authoritative administrator allowlist. Keep the current login only for
    # display and audit records.
    if user_id != settings.admin_github_user_id:
        raise HTTPException(status_code=403, detail="this GitHub account is not an administrator")
    avatar_url = user.get("avatarUrl") or user.get("avatar_url")
    return {"id": user_id, "login": login, "avatarUrl": avatar_url}


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


def normalized_network_address(address: str) -> str | None:
    """Minimize an address before hashing; IPv6 visitors are grouped by /64."""

    candidate = address.strip().partition("%")[0]
    try:
        parsed = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if isinstance(parsed, ipaddress.IPv6Address):
        if parsed.ipv4_mapped is not None:
            return parsed.ipv4_mapped.compressed
        network = ipaddress.ip_network(f"{parsed.compressed}/64", strict=False)
        return f"{network.network_address.compressed}/64"
    return parsed.compressed


def stable_visitor_hash(address: str, settings: Settings, context: str) -> str | None:
    """Return a stable, context-separated digest without storing the address."""

    normalized = normalized_network_address(address)
    if normalized is None:
        return None
    message = context.encode("utf-8") + b"\0" + normalized.encode("utf-8")
    return hmac.new(settings.statistics_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


_OBVIOUS_BOT_USER_AGENT_MARKERS = (
    "bot",
    "crawler",
    "spider",
    "slurp",
    "archiver",
    "headlesschrome",
    "lighthouse",
    "facebookexternalhit",
    "telegrambot",
    "discordbot",
    "linkedinbot",
    "whatsapp",
    "curl/",
    "wget/",
    "python-requests",
    "python-httpx",
    "go-http-client",
    "postmanruntime",
)


def is_obvious_bot(request: Request) -> bool:
    """Ignore explicit crawlers, scripted clients, previews, and prefetches.

    The user agent is inspected in memory only and is never written to the
    database or audit log.
    """

    user_agent = request.headers.get("User-Agent", "").strip().lower()
    if not user_agent or any(marker in user_agent for marker in _OBVIOUS_BOT_USER_AGENT_MARKERS):
        return True
    purpose = " ".join(
        (
            request.headers.get("Purpose", ""),
            request.headers.get("Sec-Purpose", ""),
            request.headers.get("X-Moz", ""),
        )
    ).lower()
    return any(marker in purpose for marker in ("prefetch", "prerender", "preview"))


def statistics_opted_out(request: Request) -> bool:
    return request.headers.get("DNT", "").strip() == "1" or request.headers.get("Sec-GPC", "").strip() == "1"


def statistics_cross_site(request: Request, settings: Settings) -> bool:
    if request.headers.get("Sec-Fetch-Site", "").strip().lower() == "cross-site":
        return True
    origin = request.headers.get("Origin", "").strip().rstrip("/")
    return bool(origin and origin != settings.public_base_url)


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
