from __future__ import annotations

from fastapi.testclient import TestClient


def create_article(client: TestClient, document: dict[str, object], slug: str = "first-post") -> dict[str, object]:
    response = client.post(
        "/api/articles/v1/admin/articles",
        json={
            "title": "第一篇文章",
            "slug": slug,
            "summary": "一段摘要",
            "tags": ["Rust", "机器人"],
            "contentJson": document,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["article"]


def test_draft_publish_search_and_etag(admin_client: TestClient, document: dict[str, object]) -> None:
    article = create_article(admin_client, document)
    assert article["status"] == "draft"
    assert article["revision"] == 1
    assert article["tags"] == ["Rust", "机器人"]
    assert admin_client.get("/api/articles/v1/articles").json()["items"] == []

    response = admin_client.post(
        f"/api/articles/v1/admin/articles/{article['id']}/publish",
        json={"revision": article["revision"]},
    )
    assert response.status_code == 200
    published = response.json()["article"]
    assert published["status"] == "published"
    assert response.headers["etag"] == '"revision-2"'

    listing = admin_client.get("/api/articles/v1/articles?q=RoboMaster").json()
    assert [item["slug"] for item in listing["items"]] == ["first-post"]
    detail = admin_client.get("/api/articles/v1/articles/first-post").json()["article"]
    assert "<strong>Rust 与 RoboMaster</strong>" in detail["contentHtml"]
    tags = admin_client.get("/api/articles/v1/tags").json()["items"]
    assert {item["name"] for item in tags} == {"Rust", "机器人"}


def test_autosave_checkpoint_and_revision_conflict(admin_client: TestClient, document: dict[str, object]) -> None:
    article = create_article(admin_client, document)
    first = admin_client.patch(
        f"/api/articles/v1/admin/articles/{article['id']}",
        json={"revision": 1, "summary": "自动保存", "reason": "autosave", "checkpoint": False},
    )
    assert first.status_code == 200
    assert first.json()["article"]["revision"] == 2
    revisions = admin_client.get(
        f"/api/articles/v1/admin/articles/{article['id']}/revisions"
    ).json()["items"]
    assert [item["revision"] for item in revisions] == [1]
    assert {"id", "title", "summary"}.issubset(revisions[0])

    checkpoint = admin_client.patch(
        f"/api/articles/v1/admin/articles/{article['id']}",
        json={"revision": 2, "summary": "检查点", "reason": "autosave", "checkpoint": True},
    )
    assert checkpoint.status_code == 200
    revisions = admin_client.get(
        f"/api/articles/v1/admin/articles/{article['id']}/revisions"
    ).json()["items"]
    assert [item["revision"] for item in revisions] == [3, 1]

    throttled_checkpoint = admin_client.patch(
        f"/api/articles/v1/admin/articles/{article['id']}",
        json={"revision": 3, "summary": "过早的第二个检查点", "reason": "autosave", "checkpoint": True},
    )
    assert throttled_checkpoint.status_code == 200
    revisions = admin_client.get(
        f"/api/articles/v1/admin/articles/{article['id']}/revisions"
    ).json()["items"]
    assert [item["revision"] for item in revisions] == [3, 1]

    conflict = admin_client.patch(
        f"/api/articles/v1/admin/articles/{article['id']}",
        json={"revision": 1, "summary": "覆盖别人的修改"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "revision_conflict"


def test_published_slug_change_keeps_redirect(admin_client: TestClient, document: dict[str, object]) -> None:
    article = create_article(admin_client, document, "old-slug")
    published = admin_client.post(
        f"/api/articles/v1/admin/articles/{article['id']}/publish", json={"revision": 1}
    ).json()["article"]
    renamed = admin_client.patch(
        f"/api/articles/v1/admin/articles/{article['id']}",
        json={"revision": published["revision"], "slug": "new-slug"},
    )
    assert renamed.status_code == 200
    redirect = admin_client.get("/api/articles/v1/articles/old-slug", follow_redirects=False)
    assert redirect.status_code == 308
    assert redirect.headers["location"].endswith("/articles/new-slug")
    internal_redirect = admin_client.get("/v1/articles/old-slug", follow_redirects=False)
    assert internal_redirect.status_code == 308
    assert internal_redirect.headers["location"] == "/v1/articles/new-slug"


def test_h1_and_untrusted_image_are_rejected(admin_client: TestClient) -> None:
    bad_heading = {
        "type": "doc",
        "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "no"}]}],
    }
    response = admin_client.post(
        "/api/articles/v1/admin/articles",
        json={"title": "bad", "slug": "bad", "contentJson": bad_heading},
    )
    assert response.status_code == 422

    bad_image = {
        "type": "doc",
        "content": [{"type": "image", "attrs": {"src": "https://evil.example/a.png"}}],
    }
    response = admin_client.post(
        "/api/articles/v1/admin/articles",
        json={"title": "bad", "slug": "bad-image", "contentJson": bad_image},
    )
    assert response.status_code == 422


def test_csrf_is_required(client: TestClient, document: dict[str, object]) -> None:
    response = client.post(
        "/api/articles/v1/admin/articles",
        json={"title": "not allowed", "slug": "not-allowed", "contentJson": document},
    )
    assert response.status_code == 401
