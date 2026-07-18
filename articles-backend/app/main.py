from __future__ import annotations

from contextlib import asynccontextmanager
import hmac
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from . import __version__
from .config import get_settings
from .media import ensure_media_backup_lock, safe_media_path
from .routers import admin, auth, public, stats

HSTS_HEADER = "max-age=31536000"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.validate_runtime_secrets()
    settings.media_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    ensure_media_backup_lock(settings)
    yield


class ResponsePolicyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        settings = get_settings()
        host = request.headers.get("host", "").partition(":")[0].lower()
        path = request.url.path
        media_host = urlparse(settings.media_public_base_url).hostname
        if host == media_host:
            forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
            if forwarded_proto == "http":
                secure_url = request.url.replace(scheme="https", netloc=host)
                return RedirectResponse(
                    str(secure_url),
                    status_code=308,
                    headers={
                        "Cache-Control": "no-store",
                        "Strict-Transport-Security": HSTS_HEADER,
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            if not path.startswith("/media/"):
                return JSONResponse(
                    {"detail": "not found"},
                    status_code=404,
                    headers={"Strict-Transport-Security": HSTS_HEADER},
                )
            if request.method not in {"GET", "HEAD"}:
                return JSONResponse(
                    {"detail": "method not allowed"},
                    status_code=405,
                    headers={"Allow": "GET, HEAD", "Strict-Transport-Security": HSTS_HEADER},
                )
        elif settings.origin_shared_secret and path.startswith(("/api/articles/", "/v1/")):
            supplied = request.headers.get("X-ZR-Origin-Token", "")
            if not hmac.compare_digest(supplied.encode("utf-8"), settings.origin_shared_secret.encode("utf-8")):
                return JSONResponse({"detail": "not found"}, status_code=404)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Strict-Transport-Security", HSTS_HEADER)
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if (
            request.method != "GET"
            or "/admin/" in path
            or "/auth/" in path
            or path.endswith("/comments")
            or path.endswith("/stats")
            or "/stats/" in path
        ):
            response.headers.setdefault("Cache-Control", "no-store")
        elif path.startswith("/api/articles/v1/articles") or path in {
            "/api/articles/v1/tags",
            "/api/articles/v1/rss.xml",
            "/api/articles/v1/sitemap.xml",
        }:
            max_age = get_settings().public_cache_seconds
            response.headers.setdefault(
                "Cache-Control", f"public, max-age=60, s-maxage={max_age}, stale-if-error=604800"
            )
        return response


class RequestBodyLimitMiddleware:
    def __init__(self, app):  # type: ignore[no-untyped-def]
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return

        settings = get_settings()
        path = scope.get("path", "")
        if scope["method"] == "POST" and path.endswith("/comments"):
            limit = settings.max_comment_body_bytes
        elif scope["method"] == "POST" and path.endswith("/admin/media"):
            limit = settings.max_upload_bytes + 1024 * 1024
        else:
            limit = settings.max_json_body_bytes

        headers = dict(scope.get("headers", []))
        raw_content_length = headers.get(b"content-length")
        if raw_content_length is not None:
            try:
                content_length = int(raw_content_length)
            except ValueError:
                response = JSONResponse(
                    {"detail": "invalid Content-Length"},
                    status_code=400,
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )
                await response(scope, receive, send)
                return
            if content_length < 0 or content_length > limit:
                response = JSONResponse(
                    {"detail": "request body is too large"},
                    status_code=413,
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )
                await response(scope, receive, send)
                return

        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            if len(body) > limit:
                response = JSONResponse(
                    {"detail": "request body is too large"},
                    status_code=413,
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )
                await response(scope, receive, send)
                return
            more_body = message.get("more_body", False)

        replayed = False

        async def replay_receive():  # type: ignore[no-untyped-def]
            nonlocal replayed
            if replayed:
                return {"type": "http.request", "body": b"", "more_body": False}
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay_receive, send)


app = FastAPI(
    title="ZongRui Articles",
    version=__version__,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.add_middleware(RequestBodyLimitMiddleware)
app.add_middleware(ResponsePolicyMiddleware)
app.include_router(public.router, prefix="/api/articles/v1")
app.include_router(auth.router, prefix="/api/articles/v1")
app.include_router(admin.router, prefix="/api/articles/v1")
app.include_router(stats.router, prefix="/api/articles/v1")
# Pages strips the public `/api/articles` prefix before forwarding. Keeping the
# internal `/v1` aliases also makes local Pages emulation match production.
app.include_router(public.router, prefix="/v1", include_in_schema=False)
app.include_router(auth.router, prefix="/v1", include_in_schema=False)
app.include_router(admin.router, prefix="/v1", include_in_schema=False)
app.include_router(stats.router, prefix="/v1", include_in_schema=False)


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "zongrui-articles", "version": __version__}


def _media_response(media_path: str) -> FileResponse:
    path = safe_media_path(media_path, get_settings())
    if not path.is_file():
        raise HTTPException(status_code=404, detail="media not found")
    return FileResponse(
        path,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@app.get("/media/{media_path:path}")
def serve_media(media_path: str) -> FileResponse:
    return _media_response(media_path)


@app.head("/media/{media_path:path}")
def head_media(media_path: str) -> FileResponse:
    return _media_response(media_path)


@app.exception_handler(404)
async def not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse({"detail": "not found"}, status_code=404)
