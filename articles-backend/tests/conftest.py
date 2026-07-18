from __future__ import annotations

import os
import tempfile
from collections.abc import Generator
from pathlib import Path


TEST_ROOT = Path(tempfile.mkdtemp(prefix="zongrui-articles-tests-"))
os.environ.update(
    {
        "ARTICLES_DATABASE_URL": f"sqlite:///{(TEST_ROOT / 'test.db').as_posix()}",
        "ARTICLES_MEDIA_DIR": str(TEST_ROOT / "media"),
        "ARTICLES_PUBLIC_BASE_URL": "http://testserver",
        "ARTICLES_MEDIA_PUBLIC_BASE_URL": "https://media.example.test/media",
        "ARTICLES_GITHUB_CLIENT_ID": "test-client",
        "ARTICLES_GITHUB_CLIENT_SECRET": "test-secret",
        "ARTICLES_ADMIN_GITHUB_USER_ID": "12345",
        "ARTICLES_ADMIN_GITHUB_LOGIN": "ZONGRUICHD",
        "ARTICLES_TURNSTILE_BYPASS": "true",
        "ARTICLES_RATE_LIMIT_SECRET": "test-rate-limit-secret-with-at-least-32-bytes",
        "ARTICLES_STATISTICS_SECRET": "test-statistics-secret-with-at-least-32-bytes",
        "ARTICLES_STATISTICS_STARTED_AT": "2026-07-18T00:00:00Z",
        "ARTICLES_COOKIE_SECURE": "false",
        "ARTICLES_TRUST_PROXY_HEADERS": "true",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import CSRF_COOKIE, SESSION_COOKIE, create_admin_session  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_client(client: TestClient) -> TestClient:
    with SessionLocal() as db:
        session_token, csrf_token = create_admin_session(db, 12345, "ZONGRUICHD", get_settings())
    client.cookies.set(SESSION_COOKIE, session_token)
    client.cookies.set(CSRF_COOKIE, csrf_token)
    client.headers["X-CSRF-Token"] = csrf_token
    return client


@pytest.fixture
def document() -> dict[str, object]:
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "测试标题"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Rust 与 RoboMaster", "marks": [{"type": "bold"}]}
                ],
            },
        ],
    }
