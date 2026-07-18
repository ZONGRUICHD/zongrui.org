from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ARTICLES_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = Field(default=18_232, ge=1, le=65_535)
    database_url: str = "sqlite:////var/lib/zongrui-articles/articles.db"
    media_dir: Path = Path("/var/lib/zongrui-articles/media")
    public_base_url: str = "https://zongrui.org"
    media_public_base_url: str = "https://media.zongrui.org/media"

    github_client_id: str = ""
    github_client_secret: str = ""
    github_exchange_relay_url: str = ""
    github_exchange_relay_enabled: bool = True
    admin_github_user_id: int = Field(default=0, ge=0)
    admin_github_login: str = "ZONGRUICHD"

    turnstile_secret: str = ""
    turnstile_site_key: str = ""
    turnstile_action: str = "turnstile-spin-v1"
    turnstile_bypass: bool = False
    rate_limit_secret: str = ""
    statistics_secret: str = ""
    statistics_started_at: datetime = datetime(2026, 7, 18, tzinfo=timezone.utc)
    origin_shared_secret: str = Field(
        default="",
        validation_alias=AliasChoices("ARTICLES_ORIGIN_SHARED_SECRET", "ORIGIN_SHARED_SECRET"),
    )

    cookie_secure: bool = True
    trust_proxy_headers: bool = True
    session_days: int = Field(default=7, ge=1, le=30)
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=20 * 1024 * 1024)
    max_json_body_bytes: int = Field(default=2 * 1024 * 1024, ge=16 * 1024, le=10 * 1024 * 1024)
    max_comment_body_bytes: int = Field(default=16 * 1024, ge=4096, le=128 * 1024)
    max_image_pixels: int = Field(default=40_000_000, ge=1_000_000, le=100_000_000)
    public_cache_seconds: int = Field(default=300, ge=0, le=3600)

    @field_validator("public_base_url", "media_public_base_url")
    @classmethod
    def normalise_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("https://", "http://")):
            raise ValueError("must be an absolute HTTP(S) URL")
        return value

    @field_validator("github_exchange_relay_url")
    @classmethod
    def normalise_optional_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value:
            return value
        parsed = urlparse(value)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname:
            raise ValueError("must be an absolute HTTP(S) URL when configured")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("must not contain credentials, a query, or a fragment")
        if parsed.path != "/api/articles/_oauth/github/exchange":
            raise ValueError("must use the GitHub exchange relay path")
        is_loopback = parsed.hostname == "localhost"
        try:
            is_loopback = is_loopback or ip_address(parsed.hostname).is_loopback
        except ValueError:
            pass
        if parsed.scheme != "https" and not is_loopback:
            raise ValueError("must use HTTPS unless the relay is loopback-only")
        return value

    @model_validator(mode="after")
    def validate_github_exchange_relay_host(self) -> Settings:
        if not self.github_exchange_relay_url:
            return self
        relay_host = urlparse(self.github_exchange_relay_url).hostname or ""
        public_host = urlparse(self.public_base_url).hostname or ""
        is_loopback = relay_host == "localhost"
        try:
            is_loopback = is_loopback or ip_address(relay_host).is_loopback
        except ValueError:
            pass
        is_allowed_host = (
            is_loopback
            or relay_host == public_host
            or relay_host.endswith(f".{public_host}")
            or relay_host == "zongrui-org.pages.dev"
            or relay_host.endswith(".zongrui-org.pages.dev")
        )
        if not is_allowed_host:
            raise ValueError("GitHub exchange relay host must belong to the public site or Cloudflare Pages")
        return self

    @field_validator("rate_limit_secret", "statistics_secret")
    @classmethod
    def validate_hmac_secret(cls, value: str) -> str:
        if value and len(value.encode("utf-8")) < 32:
            raise ValueError("must contain at least 32 bytes")
        return value

    @field_validator("origin_shared_secret")
    @classmethod
    def validate_origin_shared_secret(cls, value: str) -> str:
        if value and len(value.encode("utf-8")) < 32:
            raise ValueError("must contain at least 32 bytes when configured")
        return value

    @property
    def api_base(self) -> str:
        return f"{self.public_base_url}/api/articles/v1"

    @property
    def oauth_callback_url(self) -> str:
        return f"{self.api_base}/auth/github/callback"

    @property
    def oauth_exchange_relay_url(self) -> str:
        if not self.github_exchange_relay_enabled:
            return ""
        if self.github_exchange_relay_url:
            return self.github_exchange_relay_url
        if self.origin_shared_secret:
            return f"{self.public_base_url}/api/articles/_oauth/github/exchange"
        return ""

    def validate_runtime_secrets(self) -> None:
        missing: list[str] = []
        def unset(value: str) -> bool:
            return not value or value.lower().startswith("replace-")

        if unset(self.github_client_id):
            missing.append("ARTICLES_GITHUB_CLIENT_ID")
        if unset(self.github_client_secret):
            missing.append("ARTICLES_GITHUB_CLIENT_SECRET")
        if self.admin_github_user_id <= 0:
            missing.append("ARTICLES_ADMIN_GITHUB_USER_ID")
        if unset(self.rate_limit_secret):
            missing.append("ARTICLES_RATE_LIMIT_SECRET")
        if unset(self.statistics_secret):
            missing.append("ARTICLES_STATISTICS_SECRET")
        if not self.turnstile_bypass and unset(self.turnstile_secret):
            missing.append("ARTICLES_TURNSTILE_SECRET")
        if self.origin_shared_secret and unset(self.origin_shared_secret):
            missing.append("ARTICLES_ORIGIN_SHARED_SECRET")
        if (
            self.github_exchange_relay_enabled
            and self.github_exchange_relay_url
            and unset(self.origin_shared_secret)
            and "ARTICLES_ORIGIN_SHARED_SECRET" not in missing
        ):
            missing.append("ARTICLES_ORIGIN_SHARED_SECRET")
        if missing:
            raise RuntimeError("missing required configuration: " + ", ".join(missing))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
