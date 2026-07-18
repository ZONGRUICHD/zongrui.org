from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Article, ArticleReader, SiteVisitor


BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
}
STATS_SINCE = "2026-07-18T00:00:00Z"


def _headers(address: str, **extra: str) -> dict[str, str]:
    return {**BROWSER_HEADERS, "X-ZR-Visitor-IP": address, **extra}


def _create_article(slug: str, *, published: bool = True) -> str:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        article = Article(
            slug=slug,
            status="published" if published else "draft",
            title=slug,
            summary="",
            content_json='{"type":"doc","content":[]}',
            content_html="",
            content_text="",
            reading_minutes=1,
            revision=1,
            published_at=now if published else None,
        )
        db.add(article)
        db.commit()
        return article.id


def test_site_get_is_read_only_and_post_is_unique(client: TestClient) -> None:
    first_headers = _headers("203.0.113.10")
    initial = client.get("/api/articles/v1/stats/site", headers=first_headers)
    assert initial.status_code == 200
    assert initial.json() == {"uniqueVisitors": 0, "counted": False, "since": STATS_SINCE}
    assert initial.headers["cache-control"] == "no-store"

    first = client.post("/api/articles/v1/stats/site", headers=first_headers)
    assert first.status_code == 200
    assert first.json()["uniqueVisitors"] == 1
    assert first.json()["counted"] is True
    assert first.json()["since"] == STATS_SINCE

    duplicate = client.post("/api/articles/v1/stats/site", headers=first_headers)
    assert duplicate.json() == {
        "uniqueVisitors": 1,
        "counted": False,
        "since": first.json()["since"],
    }
    read_only = client.get("/api/articles/v1/stats/site", headers=first_headers)
    assert read_only.json()["uniqueVisitors"] == 1
    assert read_only.json()["counted"] is True

    second = client.post("/api/articles/v1/stats/site", headers=_headers("203.0.113.11"))
    assert second.json()["uniqueVisitors"] == 2
    assert second.json()["counted"] is True


def test_article_post_counts_site_and_reader_once(client: TestClient) -> None:
    article_id = _create_article("privacy-stats")
    address = "198.51.100.42"
    headers = _headers(address)

    initial = client.get("/api/articles/v1/stats/articles/privacy-stats", headers=headers)
    assert initial.json() == {"uniqueVisitors": 0, "counted": False, "since": STATS_SINCE}

    first = client.post("/api/articles/v1/stats/articles/privacy-stats", headers=headers)
    assert first.status_code == 200
    assert first.json()["uniqueVisitors"] == 1
    assert first.json()["counted"] is True
    duplicate = client.post("/api/articles/v1/stats/articles/privacy-stats", headers=headers)
    assert duplicate.json()["uniqueVisitors"] == 1
    assert duplicate.json()["counted"] is False

    site = client.get("/api/articles/v1/stats/site", headers=headers)
    assert site.json()["uniqueVisitors"] == 1
    assert site.json()["counted"] is True
    article = client.get("/api/articles/v1/stats/articles/privacy-stats", headers=headers)
    assert article.json()["uniqueVisitors"] == 1
    assert article.json()["counted"] is True

    with SessionLocal() as db:
        site_digest = db.scalar(select(SiteVisitor.visitor_hash))
        article_digest = db.scalar(
            select(ArticleReader.visitor_hash).where(ArticleReader.article_id == article_id)
        )
    assert site_digest is not None and article_digest is not None
    assert site_digest != article_digest
    assert address not in site_digest
    assert address not in article_digest


def test_article_contexts_are_unlinkable_and_ipv6_is_grouped_by_64(client: TestClient) -> None:
    first_article_id = _create_article("first-scope")
    second_article_id = _create_article("second-scope")
    first_address = "2001:db8:abcd:12::1"
    same_network = "2001:db8:abcd:12:ffff::99"
    next_network = "2001:db8:abcd:13::1"

    first = client.post("/api/articles/v1/stats/articles/first-scope", headers=_headers(first_address))
    duplicate_network = client.post(
        "/api/articles/v1/stats/articles/first-scope",
        headers=_headers(same_network),
    )
    assert first.json()["uniqueVisitors"] == 1
    assert duplicate_network.json()["uniqueVisitors"] == 1
    assert duplicate_network.json()["counted"] is False

    second_scope = client.post(
        "/api/articles/v1/stats/articles/second-scope",
        headers=_headers(first_address),
    )
    assert second_scope.json()["uniqueVisitors"] == 1
    next_visitor = client.post(
        "/api/articles/v1/stats/articles/first-scope",
        headers=_headers(next_network),
    )
    assert next_visitor.json()["uniqueVisitors"] == 2

    with SessionLocal() as db:
        first_digest = db.scalar(
            select(ArticleReader.visitor_hash).where(ArticleReader.article_id == first_article_id)
        )
        second_digest = db.scalar(
            select(ArticleReader.visitor_hash).where(ArticleReader.article_id == second_article_id)
        )
    assert first_digest is not None and second_digest is not None
    assert first_digest != second_digest


def test_bots_prefetch_and_privacy_signals_do_not_increment(client: TestClient) -> None:
    _create_article("do-not-track")
    endpoint = "/api/articles/v1/stats/articles/do-not-track"

    bot = client.post(
        endpoint,
        headers={"User-Agent": "Googlebot/2.1", "X-ZR-Visitor-IP": "192.0.2.1"},
    )
    assert bot.json() == {"uniqueVisitors": 0, "counted": False, "since": STATS_SINCE}

    prefetch = client.post(
        endpoint,
        headers=_headers("192.0.2.2", Purpose="prefetch"),
    )
    assert prefetch.json()["uniqueVisitors"] == 0
    dnt = client.post(endpoint, headers=_headers("192.0.2.3", DNT="1"))
    assert dnt.json()["uniqueVisitors"] == 0
    gpc = client.post(endpoint, headers=_headers("192.0.2.4", **{"Sec-GPC": "1"}))
    assert gpc.json()["uniqueVisitors"] == 0
    assert client.get("/api/articles/v1/stats/site", headers=_headers("192.0.2.5")).json()[
        "uniqueVisitors"
    ] == 0


def test_cross_site_or_unknown_address_does_not_increment(client: TestClient) -> None:
    cross_site = client.post(
        "/api/articles/v1/stats/site",
        headers=_headers("192.0.2.10", **{"Sec-Fetch-Site": "cross-site"}),
    )
    assert cross_site.json() == {"uniqueVisitors": 0, "counted": False, "since": STATS_SINCE}

    foreign_origin = client.post(
        "/api/articles/v1/stats/site",
        headers=_headers("192.0.2.11", Origin="https://attacker.example"),
    )
    assert foreign_origin.json()["uniqueVisitors"] == 0

    unknown_address = client.post("/api/articles/v1/stats/site", headers=BROWSER_HEADERS)
    assert unknown_address.json()["uniqueVisitors"] == 0

    same_origin = client.post(
        "/api/articles/v1/stats/site",
        headers=_headers(
            "192.0.2.12",
            Origin="http://testserver/",
            **{"Sec-Fetch-Site": "same-origin"},
        ),
    )
    assert same_origin.json()["uniqueVisitors"] == 1
    assert same_origin.json()["counted"] is True


def test_unknown_or_unpublished_article_does_not_count_site_visit(client: TestClient) -> None:
    _create_article("still-draft", published=False)
    headers = _headers("203.0.113.50")

    assert client.post("/api/articles/v1/stats/articles/missing", headers=headers).status_code == 404
    assert client.post("/api/articles/v1/stats/articles/still-draft", headers=headers).status_code == 404
    assert client.get("/api/articles/v1/stats/articles/missing", headers=headers).status_code == 404
    assert client.get("/api/articles/v1/stats/site", headers=headers).json()["uniqueVisitors"] == 0


def test_concurrent_duplicate_posts_remain_unique(client: TestClient) -> None:
    _create_article("concurrent-reader")
    endpoint = "/api/articles/v1/stats/articles/concurrent-reader"
    headers = _headers("198.51.100.77")

    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(lambda _: client.post(endpoint, headers=headers), range(16)))

    assert all(response.status_code == 200 for response in responses)
    assert {response.json()["uniqueVisitors"] for response in responses} == {1}
    assert client.get(endpoint, headers=headers).json()["uniqueVisitors"] == 1
    assert client.get("/api/articles/v1/stats/site", headers=headers).json()["uniqueVisitors"] == 1
