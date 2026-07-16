from __future__ import annotations

import io
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from PIL import Image

from .test_articles import create_article


def published_article(client: TestClient, document: dict[str, object]) -> dict[str, object]:
    article = create_article(client, document)
    return client.post(
        f"/api/articles/v1/admin/articles/{article['id']}/publish", json={"revision": 1}
    ).json()["article"]


def test_comments_support_one_reply_level_and_moderation(admin_client: TestClient, document: dict[str, object]) -> None:
    published_article(admin_client, document)
    root = admin_client.post(
        "/api/articles/v1/articles/first-post/comments",
        json={"nickname": "读者", "body": "第一条评论", "turnstileToken": "test"},
        headers={"CF-Connecting-IP": "203.0.113.10"},
    )
    assert root.status_code == 201
    root_id = root.json()["comment"]["id"]
    reply = admin_client.post(
        "/api/articles/v1/articles/first-post/comments",
        json={"nickname": "回复者", "body": "一级回复", "parentId": root_id, "turnstileToken": "test"},
        headers={"CF-Connecting-IP": "203.0.113.11"},
    )
    assert reply.status_code == 201
    reply_id = reply.json()["comment"]["id"]
    nested = admin_client.post(
        "/api/articles/v1/articles/first-post/comments",
        json={"nickname": "嵌套", "body": "不允许", "parentId": reply_id, "turnstileToken": "test"},
        headers={"CF-Connecting-IP": "203.0.113.12"},
    )
    assert nested.status_code == 422

    listed = admin_client.get("/api/articles/v1/articles/first-post/comments").json()["items"]
    assert listed[0]["replies"][0]["body"] == "一级回复"
    hidden = admin_client.post(f"/api/articles/v1/admin/comments/{root_id}/hide")
    assert hidden.status_code == 200
    assert admin_client.get("/api/articles/v1/articles/first-post/comments").json()["items"] == []


def test_comment_rate_limit(admin_client: TestClient, document: dict[str, object]) -> None:
    published_article(admin_client, document)
    for index in range(5):
        response = admin_client.post(
            "/api/articles/v1/articles/first-post/comments",
            json={"nickname": "same", "body": f"comment {index}", "turnstileToken": "test"},
            headers={"CF-Connecting-IP": "203.0.113.20"},
        )
        assert response.status_code == 201
    blocked = admin_client.post(
        "/api/articles/v1/articles/first-post/comments",
        json={"nickname": "same", "body": "too many", "turnstileToken": "test"},
        headers={"CF-Connecting-IP": "203.0.113.20"},
    )
    assert blocked.status_code == 429


def test_comment_request_body_limit(admin_client: TestClient, document: dict[str, object]) -> None:
    published_article(admin_client, document)
    response = admin_client.post(
        "/api/articles/v1/articles/first-post/comments",
        content=b"x" * (16 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_media_is_reencoded_and_svg_is_rejected(admin_client: TestClient, document: dict[str, object]) -> None:
    image = Image.new("RGB", (2400, 1200), (30, 120, 200))
    data = io.BytesIO()
    image.save(data, format="PNG")
    response = admin_client.post(
        "/api/articles/v1/admin/media",
        files={"file": ("source.png", data.getvalue(), "image/png")},
    )
    assert response.status_code == 201, response.text
    media = response.json()["media"]
    assert media["mimeType"] == "image/webp"
    assert media["width"] == 2000
    served = admin_client.get(urlparse(media["url"]).path)
    assert served.status_code == 200
    assert served.headers["cache-control"] == "public, max-age=31536000, immutable"
    media_head = admin_client.head(urlparse(media["url"]).path, headers={"Host": "media.example.test"})
    assert media_head.status_code == 200
    assert media_head.content == b""

    document_with_figure = {
        "type": "doc",
        "content": [
            *document["content"],  # type: ignore[index]
            {"type": "figureImage", "attrs": {"src": media["url"], "alt": "蓝色图片", "caption": "图片说明"}},
        ],
    }
    article = admin_client.post(
        "/api/articles/v1/admin/articles",
        json={
            "title": "带图片的文章",
            "slug": "image-post",
            "summary": "图片测试",
            "coverUrl": media["url"],
            "tags": [],
            "contentJson": document_with_figure,
        },
    )
    assert article.status_code == 201, article.text
    assert article.json()["article"]["coverUrl"] == media["url"]
    assert "<figcaption>图片说明</figcaption>" in article.json()["article"]["contentHtml"]

    svg = admin_client.post(
        "/api/articles/v1/admin/media",
        files={"file": ("bad.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")},
    )
    assert svg.status_code == 422
