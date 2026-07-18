from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..models import AdminSession
from ..schemas import SessionOut
from ..security import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    consume_oauth_state,
    create_admin_session,
    create_oauth_state,
    exchange_github_code,
    github_authorize_url,
    require_csrf,
    rotate_csrf,
    safe_return_to,
    token_hash,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def _oauth_error_redirect(
    settings: Settings,
    error_code: str,
    return_to: str = "/articles/console",
) -> RedirectResponse:
    target = safe_return_to(return_to)
    parsed = urlsplit(target)
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key != "authError"]
    query.append(("authError", error_code))
    redirect_path = urlunsplit(("", "", parsed.path, urlencode(query), parsed.fragment))
    return RedirectResponse(f"{settings.public_base_url}{redirect_path}", status_code=302)


def _set_auth_cookies(response: Response, session_token: str, csrf_token: str, settings: Settings) -> None:
    max_age = settings.session_days * 86_400
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/github/login")
def github_login(
    return_to: str | None = Query(default=None, alias="returnTo"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if not settings.github_client_id or not settings.github_client_secret or settings.admin_github_user_id <= 0:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")
    state = create_oauth_state(db, safe_return_to(return_to))
    return RedirectResponse(github_authorize_url(settings, state), status_code=302)


@router.get("/github/callback")
async def github_callback(
    code: str | None = Query(default=None, max_length=512),
    state: str | None = Query(default=None, max_length=512),
    error: str | None = Query(default=None, max_length=128),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if not state:
        return _oauth_error_redirect(settings, "state_expired")
    try:
        return_to = consume_oauth_state(db, state)
    except HTTPException:
        return _oauth_error_redirect(settings, "state_expired")

    if error:
        error_code = "access_denied" if error == "access_denied" else "github_error"
        return _oauth_error_redirect(settings, error_code, return_to)
    if not code:
        return _oauth_error_redirect(settings, "exchange_failed", return_to)

    try:
        user = await exchange_github_code(settings, code)
    except HTTPException as exc:
        error_code = {
            401: "exchange_failed",
            403: "not_admin",
            502: "github_unavailable",
            504: "github_unavailable",
        }.get(exc.status_code, "login_failed")
        return _oauth_error_redirect(settings, error_code, return_to)
    session_token, csrf_token = create_admin_session(db, int(user["id"]), str(user["login"]), settings)
    response = RedirectResponse(f"{settings.public_base_url}{return_to}", status_code=302)
    _set_auth_cookies(response, session_token, csrf_token, settings)
    return response


@router.get("/session", response_model=SessionOut)
def session_status(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    if not session_token:
        return {"authenticated": False, "user": None, "turnstileSiteKey": settings.turnstile_site_key or None}
    session = db.get(AdminSession, token_hash(session_token))
    if session is None:
        return {"authenticated": False, "user": None, "turnstileSiteKey": settings.turnstile_site_key or None}
    try:
        # Reuse the dependency's expiry semantics without exposing the raw token.
        from ..security import ensure_aware, utc_now

        if ensure_aware(session.expires_at) <= utc_now():
            db.delete(session)
            db.commit()
            return {"authenticated": False, "user": None, "turnstileSiteKey": settings.turnstile_site_key or None}
    except (TypeError, ValueError):
        return {"authenticated": False, "user": None, "turnstileSiteKey": settings.turnstile_site_key or None}
    csrf_token = rotate_csrf(db, session)
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        max_age=settings.session_days * 86_400,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return {
        "authenticated": True,
        "user": {"id": str(session.github_user_id), "login": session.github_login},
        "turnstileSiteKey": settings.turnstile_site_key or None,
    }


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> Response:
    if session_token:
        session = db.get(AdminSession, token_hash(session_token))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    response.status_code = 204
    return response
