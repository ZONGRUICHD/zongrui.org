#!/usr/bin/env python3
"""Small, dependency-free activity API for zongrui.org."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sys
import tempfile
import threading
from dataclasses import dataclass
from datetime import date, datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit


ALLOWED_ORIGIN: Final = "https://zongrui.org"
SOURCES: Final = frozenset({"github", "codex"})
PUBLIC_CACHE: Final = "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400"
NO_CACHE: Final = "no-store"
MAX_DAYS: Final = 400
MAX_WEEKS: Final = 54
MAX_COUNT: Final = 1_000_000_000
MAX_TOKEN_COUNT: Final = 9_007_199_254_740_991
MAX_BODY_HARD_LIMIT: Final = 1_048_576


class ValidationError(ValueError):
    """The submitted activity document is invalid."""


@dataclass(frozen=True, slots=True)
class Config:
    host: str
    port: int
    data_dir: Path
    sync_token: bytes
    max_body_bytes: int

    @classmethod
    def from_env(cls) -> Config:
        host = os.environ.get("ZONGRUI_ACTIVITY_HOST", "127.0.0.1").strip()
        if not host:
            raise ValueError("ZONGRUI_ACTIVITY_HOST must not be empty")

        port = _bounded_env_int("ZONGRUI_ACTIVITY_PORT", 18_231, 1, 65_535)
        max_body = _bounded_env_int(
            "ZONGRUI_ACTIVITY_MAX_BODY_BYTES", 131_072, 1_024, MAX_BODY_HARD_LIMIT
        )
        data_dir = Path(
            os.environ.get("ZONGRUI_ACTIVITY_DATA_DIR", "./backend/data")
        ).expanduser()

        token_text = os.environ.get("ZONGRUI_ACTIVITY_SYNC_TOKEN", "")
        token = token_text.encode("utf-8")
        if len(token) < 32:
            raise ValueError("ZONGRUI_ACTIVITY_SYNC_TOKEN must contain at least 32 bytes")
        if len(token) > 4_096:
            raise ValueError("ZONGRUI_ACTIVITY_SYNC_TOKEN is too long")

        return cls(host, port, data_dir, token, max_body)


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _normalise_days(
    days: Any,
    field: str,
    *,
    include_weekday: bool,
    include_tokens: bool = False,
) -> list[dict[str, Any]]:
    if not isinstance(days, list):
        raise ValidationError(f"{field} must be an array")
    if len(days) > MAX_DAYS:
        raise ValidationError(f"{field} must contain no more than {MAX_DAYS} entries")

    normalised: list[dict[str, Any]] = []
    seen_dates: set[str] = set()
    for index, item in enumerate(days):
        item_field = f"{field}[{index}]"
        if not isinstance(item, dict):
            raise ValidationError(f"{item_field} must be an object")
        expected_keys = {"date", "count", "level"}
        if include_weekday:
            expected_keys.add("weekday")
        if include_tokens:
            expected_keys.add("tokens")
        if set(item) != expected_keys:
            raise ValidationError(f"{item_field} has unsupported or missing fields")

        day_text = item.get("date")
        count = item.get("count")
        level = item.get("level")
        if not isinstance(day_text, str):
            raise ValidationError(f"{item_field}.date must be a string")
        try:
            parsed_day = date.fromisoformat(day_text)
        except ValueError as exc:
            raise ValidationError(f"{item_field}.date must use YYYY-MM-DD") from exc
        if parsed_day.isoformat() != day_text:
            raise ValidationError(f"{item_field}.date must use YYYY-MM-DD")
        if day_text in seen_dates:
            raise ValidationError(f"duplicate date: {day_text}")
        seen_dates.add(day_text)

        if isinstance(count, bool) or not isinstance(count, int):
            raise ValidationError(f"{item_field}.count must be an integer")
        if not 0 <= count <= MAX_COUNT:
            raise ValidationError(f"{item_field}.count is outside the allowed range")
        if isinstance(level, bool) or not isinstance(level, int) or not 0 <= level <= 4:
            raise ValidationError(f"{item_field}.level must be an integer from 0 to 4")

        day = {"date": day_text}
        if include_weekday:
            weekday = item.get("weekday")
            if isinstance(weekday, bool) or not isinstance(weekday, int) or not 0 <= weekday <= 6:
                raise ValidationError(f"{item_field}.weekday must be an integer from 0 to 6")
            day["weekday"] = weekday
        day.update({"count": count, "level": level})
        if include_tokens:
            day["tokens"] = _non_negative_integer(
                item.get("tokens"), f"{item_field}.tokens", maximum=MAX_TOKEN_COUNT
            )
        normalised.append(day)

    normalised.sort(key=lambda item: item["date"])
    return normalised


def _normalise_date(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"{field} must use YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise ValidationError(f"{field} must use YYYY-MM-DD")
    return value


def _normalise_timestamp(value: Any, field: str) -> str:
    if not isinstance(value, str) or len(value) > 64:
        raise ValidationError(f"{field} must be an ISO 8601 timestamp")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise ValidationError(f"{field} must be an ISO 8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ValidationError(f"{field} must include a timezone")
    return value


def _normalise_boundary(value: Any, field: str) -> str:
    """Accept a calendar date (Codex) or an offset timestamp (GitHub GraphQL)."""
    if isinstance(value, str):
        try:
            return _normalise_date(value, field)
        except ValidationError:
            pass
    return _normalise_timestamp(value, field)


def _non_negative_integer(
    value: Any, field: str, *, maximum: int = MAX_COUNT
) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise ValidationError(f"{field} must be a non-negative integer")
    return value


def _check_keys(document: dict[str, Any], required: set[str], *, stored: bool) -> None:
    allowed = required | ({"receivedAt"} if stored else set())
    if set(document) != allowed:
        raise ValidationError("JSON body has unsupported or missing fields")


def normalise_activity(source: str, document: Any, *, stored: bool = False) -> dict[str, Any]:
    """Validate and rebuild an activity object so unrecognised data is never stored."""
    if source not in SOURCES:
        raise ValidationError("unknown activity source")
    if not isinstance(document, dict):
        raise ValidationError("JSON body must be an object")
    if document.get("schemaVersion") != 1:
        raise ValidationError("schemaVersion must be 1")
    if document.get("kind") != source:
        raise ValidationError(f"kind must be {source}")

    common = {"schemaVersion", "kind", "startedAt", "endedAt", "updatedAt"}
    if source == "github":
        required = common | {"login", "totalContributions", "weeks"}
        _check_keys(document, required, stored=stored)
        login = document["login"]
        if not isinstance(login, str) or re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", login) is None:
            raise ValidationError("login is not a valid GitHub login")
        total = _non_negative_integer(document["totalContributions"], "totalContributions")
        raw_weeks = document["weeks"]
        if not isinstance(raw_weeks, list) or len(raw_weeks) > MAX_WEEKS:
            raise ValidationError(f"weeks must be an array with no more than {MAX_WEEKS} entries")
        weeks: list[dict[str, Any]] = []
        seen_dates: set[str] = set()
        for index, raw_week in enumerate(raw_weeks):
            if not isinstance(raw_week, dict) or set(raw_week) != {"firstDay", "days"}:
                raise ValidationError(f"weeks[{index}] has unsupported or missing fields")
            days = _normalise_days(
                raw_week["days"], f"weeks[{index}].days", include_weekday=True
            )
            if len(days) > 7:
                raise ValidationError(f"weeks[{index}].days must contain no more than 7 entries")
            for day in days:
                if day["date"] in seen_dates:
                    raise ValidationError(f"duplicate date: {day['date']}")
                seen_dates.add(day["date"])
            weeks.append(
                {
                    "firstDay": _normalise_date(raw_week["firstDay"], f"weeks[{index}].firstDay"),
                    "days": days,
                }
            )
        if sum(day["count"] for week in weeks for day in week["days"]) != total:
            raise ValidationError("totalContributions does not match weeks")
        result: dict[str, Any] = {
            "schemaVersion": 1,
            "kind": "github",
            "login": login,
            "totalContributions": total,
            "startedAt": _normalise_boundary(document["startedAt"], "startedAt"),
            "endedAt": _normalise_boundary(document["endedAt"], "endedAt"),
            "weeks": weeks,
            "updatedAt": _normalise_timestamp(document["updatedAt"], "updatedAt"),
        }
    else:
        has_token_stats = "totalTokens" in document
        required = common | {"totalTurns", "activeDays", "days"}
        if has_token_stats:
            required.add("totalTokens")
        _check_keys(document, required, stored=stored)
        days = _normalise_days(
            document["days"],
            "days",
            include_weekday=False,
            include_tokens=has_token_stats,
        )
        if not has_token_stats:
            for day in days:
                day["tokens"] = 0
        total_turns = _non_negative_integer(document["totalTurns"], "totalTurns")
        total_tokens = _non_negative_integer(
            document.get("totalTokens", 0),
            "totalTokens",
            maximum=MAX_TOKEN_COUNT,
        )
        active_days = _non_negative_integer(document["activeDays"], "activeDays")
        if sum(day["count"] for day in days) != total_turns:
            raise ValidationError("totalTurns does not match days")
        if sum(day["tokens"] for day in days) != total_tokens:
            raise ValidationError("totalTokens does not match days")
        if sum(day["count"] > 0 for day in days) != active_days:
            raise ValidationError("activeDays does not match days")
        result = {
            "schemaVersion": 1,
            "kind": "codex",
            "totalTurns": total_turns,
            "totalTokens": total_tokens,
            "activeDays": active_days,
            "startedAt": _normalise_boundary(document["startedAt"], "startedAt"),
            "endedAt": _normalise_boundary(document["endedAt"], "endedAt"),
            "days": days,
            "updatedAt": _normalise_timestamp(document["updatedAt"], "updatedAt"),
        }

    if stored:
        result["receivedAt"] = _normalise_timestamp(document["receivedAt"], "receivedAt")
    return result


class ActivityStore:
    """A tiny JSON store with per-process locking and atomic replacement."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory.resolve()
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            self.directory.chmod(0o700)
        except OSError:
            pass
        self._lock = threading.RLock()

    def _path(self, source: str) -> Path:
        if source not in SOURCES:
            raise ValueError("unknown activity source")
        return self.directory / f"{source}.json"

    def read(self, source: str) -> dict[str, Any] | None:
        path = self._path(source)
        with self._lock:
            try:
                raw = path.read_text(encoding="utf-8")
            except FileNotFoundError:
                return None
            document = json.loads(raw)

        return normalise_activity(source, document, stored=True)

    def write(self, source: str, document: dict[str, Any]) -> dict[str, Any]:
        path = self._path(source)
        record = dict(document)
        record["receivedAt"] = _utc_now()
        encoded = (
            json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        ).encode("utf-8")

        with self._lock:
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{source}.", suffix=".tmp", dir=self.directory
            )
            temporary_path = Path(temporary_name)
            try:
                try:
                    os.chmod(temporary_path, 0o600)
                except OSError:
                    pass
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(encoded)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary_path, path)
                _sync_directory(self.directory)
            except BaseException:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
                temporary_path.unlink(missing_ok=True)
                raise
        return record


def _sync_directory(directory: Path) -> None:
    flags = os.O_RDONLY
    flags |= getattr(os, "O_DIRECTORY", 0)
    try:
        descriptor = os.open(directory, flags)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        pass
    finally:
        os.close(descriptor)


class ActivityHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], config: Config, store: ActivityStore):
        super().__init__(address, ActivityHandler)
        self.config = config
        self.store = store


class ActivityHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ZongruiActivityAPI/1"
    sys_version = ""
    server: ActivityHTTPServer

    def version_string(self) -> str:
        return self.server_version

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        path = urlsplit(self.path).path
        sys.stderr.write(
            f'{self.client_address[0]} - "{self.command} {path}" {code} {size}\n'
        )

    def log_message(self, format: str, *args: object) -> None:
        # Never log headers, query strings, request bodies, or supplied tokens.
        sys.stderr.write("activity-api: request processing error\n")

    def do_GET(self) -> None:  # noqa: N802
        self._handle_get(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle_get(head_only=True)

    def do_OPTIONS(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        if path not in {
            "/health",
            "/api/activity",
            "/api/github",
            "/api/codex",
            "/api/sync/github",
            "/api/sync/codex",
        }:
            self._error(HTTPStatus.NOT_FOUND, "not_found", "Endpoint not found")
            return
        if self.headers.get("Origin") != ALLOWED_ORIGIN:
            self._error(HTTPStatus.FORBIDDEN, "origin_denied", "Origin is not allowed")
            return

        requested_method = self.headers.get("Access-Control-Request-Method", "")
        if requested_method not in {"GET", "HEAD", "POST"}:
            self._error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Method not allowed")
            return
        requested_headers = {
            part.strip().lower()
            for part in self.headers.get("Access-Control-Request-Headers", "").split(",")
            if part.strip()
        }
        if not requested_headers.issubset({"authorization", "content-type"}):
            self._error(HTTPStatus.FORBIDDEN, "headers_denied", "Requested headers are not allowed")
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self._common_headers(NO_CACHE)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        source = {
            "/api/sync/github": "github",
            "/api/sync/codex": "codex",
        }.get(path)
        if source is None:
            self.close_connection = True
            self._error(HTTPStatus.NOT_FOUND, "not_found", "Endpoint not found")
            return
        if not self._request_origin_allowed():
            self.close_connection = True
            self._error(HTTPStatus.FORBIDDEN, "origin_denied", "Origin is not allowed")
            return
        if not self._authorised():
            self.close_connection = True
            self._error(HTTPStatus.UNAUTHORIZED, "unauthorized", "A valid bearer token is required")
            return

        try:
            document = self._read_json_body()
            activity = normalise_activity(source, document)
        except ValidationError as exc:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_activity", str(exc))
            return
        except UnicodeDecodeError:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_encoding", "JSON must use UTF-8")
            return
        except json.JSONDecodeError:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_json", "Request body is not valid JSON")
            return
        except BodyError as exc:
            self.close_connection = True
            self._error(exc.status, exc.code, exc.message)
            return

        try:
            record = self.server.store.write(source, activity)
        except OSError:
            self.log_error("storage write failed")
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "storage_error", "Unable to store activity")
            return
        self._json_response(
            HTTPStatus.OK,
            {"ok": True, "data": record},
            cache_control=NO_CACHE,
        )

    def do_PUT(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def do_PATCH(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def do_DELETE(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def _method_not_allowed(self) -> None:
        self._error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Method not allowed")

    def _handle_get(self, *, head_only: bool) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self._json_response(
                HTTPStatus.OK,
                {"status": "ok", "service": "zongrui-activity-api", "version": 1},
                cache_control=NO_CACHE,
                head_only=head_only,
            )
            return

        try:
            if path == "/api/github":
                payload = self.server.store.read("github")
            elif path == "/api/codex":
                payload = self.server.store.read("codex")
            elif path == "/api/activity":
                github = self.server.store.read("github")
                codex = self.server.store.read("codex")
                timestamps = [
                    record["updatedAt"]
                    for record in (github, codex)
                    if record is not None
                ]
                payload = {
                    "version": 1,
                    "updatedAt": max(timestamps) if timestamps else None,
                    "github": github,
                    "codex": codex,
                }
            else:
                self._error(HTTPStatus.NOT_FOUND, "not_found", "Endpoint not found")
                return
        except (OSError, ValueError, json.JSONDecodeError):
            self.log_error("storage read failed")
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "storage_error", "Unable to read activity")
            return

        self._json_response(
            HTTPStatus.OK,
            payload,
            cache_control=PUBLIC_CACHE,
            head_only=head_only,
            use_etag=True,
        )

    def _request_origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return origin is None or origin == ALLOWED_ORIGIN

    def _authorised(self) -> bool:
        value = self.headers.get("Authorization", "")
        if len(value) > 4_103 or not value.startswith("Bearer "):
            return False
        supplied = value[7:].encode("utf-8")
        return secrets.compare_digest(supplied, self.server.config.sync_token)

    def _read_json_body(self) -> Any:
        if self.headers.get("Transfer-Encoding") is not None:
            self.close_connection = True
            raise BodyError(HTTPStatus.BAD_REQUEST, "unsupported_encoding", "Transfer-Encoding is not supported")
        if self.headers.get_content_type() != "application/json":
            raise BodyError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_media_type", "Content-Type must be application/json")

        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise BodyError(HTTPStatus.LENGTH_REQUIRED, "length_required", "Content-Length is required")
        try:
            length = int(raw_length, 10)
        except ValueError as exc:
            raise BodyError(HTTPStatus.BAD_REQUEST, "invalid_length", "Content-Length is invalid") from exc
        if length < 0:
            raise BodyError(HTTPStatus.BAD_REQUEST, "invalid_length", "Content-Length is invalid")
        if length > self.server.config.max_body_bytes:
            self.close_connection = True
            raise BodyError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "body_too_large", "Request body is too large")

        body = self.rfile.read(length)
        if len(body) != length:
            self.close_connection = True
            raise BodyError(HTTPStatus.BAD_REQUEST, "incomplete_body", "Request body is incomplete")
        return json.loads(body.decode("utf-8"))

    def _error(self, status: HTTPStatus, code: str, message: str) -> None:
        self._json_response(
            status,
            {"error": {"code": code, "message": message}},
            cache_control=NO_CACHE,
        )

    def _json_response(
        self,
        status: HTTPStatus,
        payload: Any,
        *,
        cache_control: str,
        head_only: bool = False,
        use_etag: bool = False,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        etag = f'"{hashlib.sha256(body).hexdigest()}"' if use_etag else None
        if etag is not None and self.headers.get("If-None-Match") == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self._common_headers(cache_control, etag=etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        self.send_response(status)
        self._common_headers(cache_control, etag=etag)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _common_headers(self, cache_control: str, *, etag: str | None = None) -> None:
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Vary", "Origin")
        if self.headers.get("Origin") == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Expose-Headers", "ETag")
        if etag is not None:
            self.send_header("ETag", etag)
        if self.close_connection:
            self.send_header("Connection", "close")


@dataclass(frozen=True, slots=True)
class BodyError(Exception):
    status: HTTPStatus
    code: str
    message: str


def main() -> int:
    try:
        config = Config.from_env()
        store = ActivityStore(config.data_dir)
        server = ActivityHTTPServer((config.host, config.port), config, store)
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"activity-api: startup failed: {exc}\n")
        return 2

    sys.stderr.write(f"activity-api: listening on {config.host}:{config.port}\n")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
