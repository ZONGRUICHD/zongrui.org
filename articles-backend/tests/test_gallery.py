from __future__ import annotations

import io
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from PIL import Image


def _image_bytes(
    color: tuple[int, int, int], size: tuple[int, int] = (64, 48)
) -> bytes:
    output = io.BytesIO()
    image = Image.new("RGB", size, color)
    exif = Image.Exif()
    exif[0x010E] = "private description"
    exif[0x013B] = "private author"
    image.save(output, format="JPEG", quality=92, exif=exif)
    return output.getvalue()


def _upload_media(client: TestClient, color: tuple[int, int, int]) -> dict[str, object]:
    response = client.post(
        "/api/articles/v1/admin/media",
        files={"file": ("photo.jpg", _image_bytes(color), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    return response.json()["media"]


def _create_gallery_item(
    client: TestClient,
    color: tuple[int, int, int],
    *,
    title: str,
    alt: str,
    order: int | None = None,
) -> dict[str, object]:
    media = _upload_media(client, color)
    payload: dict[str, object] = {
        "mediaId": media["id"],
        "title": title,
        "caption": f"{title} caption",
        "alt": alt,
    }
    if order is not None:
        payload["order"] = order
    response = client.post("/api/articles/v1/admin/gallery", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["image"]


def test_gallery_admin_requires_auth(client: TestClient) -> None:
    assert client.get("/api/articles/v1/admin/gallery").status_code == 401


def test_gallery_admin_crud_and_visibility(
    client: TestClient, admin_client: TestClient
) -> None:
    media = _upload_media(admin_client, (20, 40, 60))
    created = admin_client.post(
        "/api/articles/v1/admin/gallery",
        json={
            "mediaId": media["id"],
            "title": "  Workshop  ",
            "caption": "  A workbench photo.  ",
            "alt": "  A blue robot on a workbench  ",
            "order": 30,
        },
    )
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    assert "/v1/gallery" in created.headers["x-zr-cache-invalidate"]
    image = created.json()["image"]
    assert image["status"] == "draft"
    assert image["title"] == "Workshop"
    assert image["caption"] == "A workbench photo."
    assert image["alt"] == "A blue robot on a workbench"
    assert image["mediaId"] == media["id"]
    assert image["width"] == 64
    assert image["height"] == 48
    assert image["publishedAt"] is None

    duplicate = admin_client.post(
        "/api/articles/v1/admin/gallery",
        json={"mediaId": media["id"], "alt": "Duplicate"},
    )
    assert duplicate.status_code == 409

    public_draft = client.get("/api/articles/v1/gallery")
    assert public_draft.status_code == 200
    assert public_draft.json()["items"] == []
    assert "s-maxage=" in public_draft.headers["cache-control"]

    fetched = admin_client.get(f"/api/articles/v1/admin/gallery/{image['id']}")
    assert fetched.status_code == 200
    patched = admin_client.patch(
        f"/api/articles/v1/admin/gallery/{image['id']}",
        json={
            "title": "Robot night",
            "caption": "",
            "alt": "Robot LEDs at night",
            "order": 5,
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["image"]["order"] == 5

    published = admin_client.post(
        f"/api/articles/v1/admin/gallery/{image['id']}/publish"
    )
    assert published.status_code == 200, published.text
    assert published.json()["image"]["status"] == "published"
    assert published.json()["image"]["publishedAt"] is not None

    public = client.get("/api/articles/v1/gallery")
    assert public.status_code == 200
    public_image = public.json()["items"][0]
    assert public_image["id"] == image["id"]
    assert public_image["title"] == "Robot night"
    assert public_image["alt"] == "Robot LEDs at night"
    assert "status" not in public_image
    assert "mediaId" not in public_image

    used_media = admin_client.delete(f"/api/articles/v1/admin/media/{media['id']}")
    assert used_media.status_code == 409
    assert used_media.json()["detail"] == "media is used in the public gallery"

    archived = admin_client.post(
        f"/api/articles/v1/admin/gallery/{image['id']}/archive"
    )
    assert archived.status_code == 200
    assert archived.json()["image"]["status"] == "archived"
    assert archived.json()["image"]["archivedAt"] is not None
    assert client.get("/api/articles/v1/gallery").json()["items"] == []

    deleted = admin_client.delete(f"/api/articles/v1/admin/gallery/{image['id']}")
    assert deleted.status_code == 204
    assert deleted.headers["x-zr-cache-invalidate"] == "/v1/gallery,/gallery"
    assert (
        admin_client.get(f"/api/articles/v1/admin/gallery/{image['id']}").status_code
        == 404
    )
    assert (
        admin_client.delete(f"/api/articles/v1/admin/media/{media['id']}").status_code
        == 204
    )


def test_gallery_reorder_and_cursor_pagination(
    admin_client: TestClient, client: TestClient
) -> None:
    first = _create_gallery_item(admin_client, (255, 0, 0), title="First", alt="Red")
    second = _create_gallery_item(
        admin_client, (0, 255, 0), title="Second", alt="Green"
    )
    third = _create_gallery_item(admin_client, (0, 0, 255), title="Third", alt="Blue")

    for image in (first, second, third):
        response = admin_client.post(
            f"/api/articles/v1/admin/gallery/{image['id']}/publish"
        )
        assert response.status_code == 200

    reordered = admin_client.post(
        "/api/articles/v1/admin/gallery/reorder",
        json={"orderedIds": [third["id"], first["id"], second["id"]]},
    )
    assert reordered.status_code == 200, reordered.text
    assert [item["id"] for item in reordered.json()["items"]] == [
        third["id"],
        first["id"],
        second["id"],
    ]
    assert [item["order"] for item in reordered.json()["items"]] == [0, 10, 20]

    page_one = client.get("/api/articles/v1/gallery?limit=2")
    assert page_one.status_code == 200
    assert [item["id"] for item in page_one.json()["items"]] == [
        third["id"],
        first["id"],
    ]
    cursor = page_one.json()["nextCursor"]
    assert cursor
    page_two = client.get(
        "/api/articles/v1/gallery", params={"limit": 2, "cursor": cursor}
    )
    assert page_two.status_code == 200
    assert [item["id"] for item in page_two.json()["items"]] == [second["id"]]
    assert page_two.json()["nextCursor"] is None

    bad_cursor = client.get("/api/articles/v1/gallery?cursor=not-a-cursor")
    assert bad_cursor.status_code == 422
    duplicate_reorder = admin_client.post(
        "/api/articles/v1/admin/gallery/reorder",
        json={"orderedIds": [first["id"], first["id"]]},
    )
    assert duplicate_reorder.status_code == 422
    missing_reorder = admin_client.post(
        "/api/articles/v1/admin/gallery/reorder",
        json={"orderedIds": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert missing_reorder.status_code == 404


def test_gallery_upload_uses_safe_media_pipeline(admin_client: TestClient) -> None:
    uploaded = admin_client.post(
        "/api/articles/v1/admin/gallery/upload",
        data={
            "title": "Large source",
            "caption": "Compressed by the server",
            "alt": "A wide generated test image",
        },
        files={
            "file": (
                "large.jpg",
                _image_bytes((90, 100, 110), (3000, 1500)),
                "image/jpeg",
            )
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    image = uploaded.json()["image"]
    assert image["status"] == "draft"
    assert image["width"] == 2000
    assert image["height"] == 1000

    media_response = admin_client.get(
        urlparse(image["url"]).path, headers={"Host": "media.example.test"}
    )
    assert media_response.status_code == 200
    with Image.open(io.BytesIO(media_response.content)) as processed:
        assert processed.format == "WEBP"
        assert processed.size == (2000, 1000)
        assert len(processed.getexif()) == 0

    blank_alt = admin_client.post(
        "/api/articles/v1/admin/gallery/upload",
        data={"alt": "   "},
        files={"file": ("photo.jpg", _image_bytes((1, 2, 3)), "image/jpeg")},
    )
    assert blank_alt.status_code == 422
    svg = admin_client.post(
        "/api/articles/v1/admin/gallery/upload",
        data={"alt": "Unsafe SVG"},
        files={
            "file": (
                "unsafe.svg",
                b"<svg xmlns='http://www.w3.org/2000/svg'/>",
                "image/svg+xml",
            )
        },
    )
    assert svg.status_code == 422


def test_gallery_mutations_require_csrf(admin_client: TestClient) -> None:
    media = _upload_media(admin_client, (120, 80, 40))
    csrf = admin_client.headers.pop("X-CSRF-Token")
    try:
        create = admin_client.post(
            "/api/articles/v1/admin/gallery",
            json={"mediaId": media["id"], "alt": "A protected image"},
        )
        assert create.status_code == 403
    finally:
        admin_client.headers["X-CSRF-Token"] = csrf
