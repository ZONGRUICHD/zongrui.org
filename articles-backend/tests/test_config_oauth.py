from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize(
    "relay_url",
    [
        "http://zongrui.org/api/articles/_oauth/github/exchange",
        "https://attacker.example/api/articles/_oauth/github/exchange",
        "https://user:password@zongrui.org/api/articles/_oauth/github/exchange",
        "https://zongrui.org/wrong-path",
        "https://zongrui.org/api/articles/_oauth/github/exchange?target=elsewhere",
    ],
)
def test_github_exchange_relay_rejects_unsafe_urls(relay_url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            public_base_url="https://zongrui.org",
            github_exchange_relay_url=relay_url,
        )


def test_github_exchange_relay_allows_site_preview_and_loopback() -> None:
    production = Settings(
        public_base_url="https://zongrui.org",
        github_exchange_relay_url="https://zongrui.org/api/articles/_oauth/github/exchange",
    )
    preview = Settings(
        public_base_url="https://zongrui.org",
        github_exchange_relay_url=(
            "https://fix-login.zongrui-org.pages.dev/api/articles/_oauth/github/exchange"
        ),
    )
    local = Settings(
        public_base_url="http://localhost:8788",
        github_exchange_relay_url="http://127.0.0.1:8788/api/articles/_oauth/github/exchange",
    )

    assert production.oauth_exchange_relay_url.startswith("https://zongrui.org/")
    assert preview.oauth_exchange_relay_url.startswith("https://fix-login.zongrui-org.pages.dev/")
    assert local.oauth_exchange_relay_url.startswith("http://127.0.0.1:8788/")


def test_explicit_github_exchange_relay_requires_origin_secret() -> None:
    settings = Settings(
        public_base_url="https://zongrui.org",
        github_client_id="client-id",
        github_client_secret="client-secret",
        github_exchange_relay_url="https://zongrui.org/api/articles/_oauth/github/exchange",
        admin_github_user_id=12345,
        rate_limit_secret="r" * 32,
        turnstile_bypass=True,
        origin_shared_secret="",
    )

    with pytest.raises(RuntimeError, match="ARTICLES_ORIGIN_SHARED_SECRET"):
        settings.validate_runtime_secrets()


def test_github_exchange_relay_can_be_disabled_independently() -> None:
    settings = Settings(
        public_base_url="https://zongrui.org",
        origin_shared_secret="s" * 32,
        github_exchange_relay_enabled=False,
    )

    assert settings.oauth_exchange_relay_url == ""
