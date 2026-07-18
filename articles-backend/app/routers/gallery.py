from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import Settings, get_settings
from ..database import get_db
from ..media import media_backup_lock, process_upload
from ..models import AdminSession, GalleryImage, Media
from ..schemas import (
    GalleryEnvelope,
    GalleryImageCreate,
    GalleryImagePatch,
    GalleryItems,
    GalleryReorder,
    PaginatedAdminGallery,
    PaginatedGallery,
)
from ..security import get_admin_session, require_csrf
from ..services import audit, aware, media_url


public_router = APIRouter(tags=["gallery"])
admin_router = APIRouter(prefix="/admin/gallery", tags=["gallery-admin"])


def _gallery_cursor(image: GalleryImage, timestamp: datetime) -> str:
    raw = json.dumps(
        [image.sort_order, aware(timestamp).isoformat(), image.id],
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_gallery_cursor(cursor: str | None) -> tuple[int, datetime, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        sort_order, timestamp_text, identifier = json.loads(raw)
        timestamp = datetime.fromisoformat(timestamp_text)
        if (
            not isinstance(sort_order, int)
            or sort_order < 0
            or timestamp.tzinfo is None
            or not isinstance(identifier, str)
            or not identifier
        ):
            raise ValueError
        return sort_order, timestamp, identifier
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="invalid cursor") from exc


def _gallery_out(
    image: GalleryImage, settings: Settings, *, admin: bool
) -> dict[str, object]:
    data: dict[str, object] = {
        "id": image.id,
        "url": media_url(image.media, settings),
        "title": image.title,
        "caption": image.caption,
        "alt": image.alt_text,
        "order": image.sort_order,
        "width": image.media.width,
        "height": image.media.height,
        "publishedAt": aware(image.published_at),
    }
    if admin:
        data.update(
            {
                "mediaId": image.media_id,
                "status": image.status,
                "archivedAt": aware(image.archived_at),
                "createdAt": aware(image.created_at),
                "updatedAt": aware(image.updated_at),
            }
        )
    return data


def _load_gallery_image(db: Session, image_id: str) -> GalleryImage:
    image = db.scalar(
        select(GalleryImage)
        .options(selectinload(GalleryImage.media))
        .where(GalleryImage.id == image_id)
    )
    if image is None:
        raise HTTPException(status_code=404, detail="gallery image not found")
    return image


def _load_media(db: Session, media_id: str) -> Media:
    media = db.get(Media, media_id)
    if media is None:
        raise HTTPException(status_code=422, detail="gallery media does not exist")
    return media


def _next_order(db: Session) -> int:
    highest = db.scalar(select(func.max(GalleryImage.sort_order)))
    return int(highest or 0) + 10


def _ensure_unused_media(
    db: Session, media_id: str, *, image_id: str | None = None
) -> None:
    existing = db.scalar(select(GalleryImage).where(GalleryImage.media_id == media_id))
    if existing is not None and existing.id != image_id:
        raise HTTPException(status_code=409, detail="media is already in the gallery")


def _invalidate_gallery(response: Response) -> None:
    response.headers["X-ZR-Cache-Invalidate"] = "/v1/gallery,/gallery"
    response.headers["Cache-Control"] = "no-store"


def _create_gallery_image(db: Session, payload: GalleryImageCreate) -> GalleryImage:
    media = _load_media(db, payload.mediaId)
    _ensure_unused_media(db, media.id)
    image = GalleryImage(
        media_id=media.id,
        title=payload.title,
        caption=payload.caption,
        alt_text=payload.alt,
        sort_order=payload.order if payload.order is not None else _next_order(db),
        status="draft",
    )
    db.add(image)
    db.flush()
    audit(
        db,
        "gallery.create",
        "gallery_image",
        image.id,
        mediaId=media.id,
        order=image.sort_order,
    )
    return image


@public_router.get("/gallery", response_model=PaginatedGallery)
def list_public_gallery(
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(GalleryImage)
        .options(selectinload(GalleryImage.media))
        .where(
            GalleryImage.status == "published",
            GalleryImage.published_at.is_not(None),
            GalleryImage.published_at <= now,
        )
    )
    decoded = _decode_gallery_cursor(cursor)
    if decoded:
        sort_order, published_at, identifier = decoded
        stmt = stmt.where(
            or_(
                GalleryImage.sort_order > sort_order,
                and_(
                    GalleryImage.sort_order == sort_order,
                    or_(
                        GalleryImage.published_at < published_at,
                        and_(
                            GalleryImage.published_at == published_at,
                            GalleryImage.id < identifier,
                        ),
                    ),
                ),
            )
        )
    rows = list(
        db.scalars(
            stmt.order_by(
                GalleryImage.sort_order.asc(),
                GalleryImage.published_at.desc(),
                GalleryImage.id.desc(),
            ).limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items and items[-1].published_at is not None:
        next_cursor = _gallery_cursor(items[-1], items[-1].published_at)
    return {
        "items": [_gallery_out(item, settings, admin=False) for item in items],
        "nextCursor": next_cursor,
    }


@admin_router.get("", response_model=PaginatedAdminGallery)
def list_admin_gallery(
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(draft|published|archived)$"
    ),
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=50, ge=1, le=100),
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    stmt = select(GalleryImage).options(selectinload(GalleryImage.media))
    if status_filter:
        stmt = stmt.where(GalleryImage.status == status_filter)
    decoded = _decode_gallery_cursor(cursor)
    if decoded:
        sort_order, updated_at, identifier = decoded
        stmt = stmt.where(
            or_(
                GalleryImage.sort_order > sort_order,
                and_(
                    GalleryImage.sort_order == sort_order,
                    or_(
                        GalleryImage.updated_at < updated_at,
                        and_(
                            GalleryImage.updated_at == updated_at,
                            GalleryImage.id < identifier,
                        ),
                    ),
                ),
            )
        )
    rows = list(
        db.scalars(
            stmt.order_by(
                GalleryImage.sort_order,
                GalleryImage.updated_at.desc(),
                GalleryImage.id.desc(),
            ).limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [_gallery_out(item, settings, admin=True) for item in items],
        "nextCursor": _gallery_cursor(items[-1], items[-1].updated_at)
        if has_more and items
        else None,
    }


@admin_router.post("", response_model=GalleryEnvelope, status_code=201)
def create_gallery_image(
    payload: GalleryImageCreate,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    image = _create_gallery_image(db, payload)
    db.commit()
    image = _load_gallery_image(db, image.id)
    _invalidate_gallery(response)
    return {"image": _gallery_out(image, settings, admin=True)}


@admin_router.post("/upload", response_model=GalleryEnvelope, status_code=201)
async def upload_gallery_image(
    response: Response,
    file: UploadFile = File(...),
    title: str = Form(default="", max_length=200),
    caption: str = Form(default="", max_length=2000),
    alt: str = Form(..., min_length=1, max_length=300),
    order: int | None = Form(default=None, ge=0, le=1_000_000),
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    title = title.strip()
    caption = caption.strip()
    alt = alt.strip()
    if not alt:
        raise HTTPException(status_code=422, detail="alt must not be blank")
    with media_backup_lock(settings):
        media = await process_upload(file, db, settings)
        image = _create_gallery_image(
            db,
            GalleryImageCreate(
                mediaId=media.id,
                title=title,
                caption=caption,
                alt=alt,
                order=order,
            ),
        )
        audit(
            db,
            "gallery.upload",
            "gallery_image",
            image.id,
            mediaId=media.id,
            sha256=media.sha256,
        )
        db.commit()
        image = _load_gallery_image(db, image.id)
    _invalidate_gallery(response)
    return {"image": _gallery_out(image, settings, admin=True)}


@admin_router.post("/reorder", response_model=GalleryItems)
def reorder_gallery(
    payload: GalleryReorder,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    images = list(
        db.scalars(select(GalleryImage).options(selectinload(GalleryImage.media))).all()
    )
    by_id = {image.id: image for image in images}
    missing = [image_id for image_id in payload.orderedIds if image_id not in by_id]
    if missing:
        raise HTTPException(
            status_code=404, detail={"code": "gallery_images_not_found", "ids": missing}
        )
    selected = [by_id[image_id] for image_id in payload.orderedIds]
    selected_ids = set(payload.orderedIds)
    remaining = sorted(
        (image for image in images if image.id not in selected_ids),
        key=lambda image: (image.sort_order, aware(image.created_at), image.id),
    )
    ordered = [*selected, *remaining]
    for index, image in enumerate(ordered):
        image.sort_order = index * 10
    audit(db, "gallery.reorder", "gallery_image", None, orderedIds=payload.orderedIds)
    db.commit()
    ordered = [_load_gallery_image(db, image.id) for image in ordered]
    _invalidate_gallery(response)
    return {"items": [_gallery_out(image, settings, admin=True) for image in ordered]}


@admin_router.get("/{image_id}", response_model=GalleryEnvelope)
def get_admin_gallery_image(
    image_id: str,
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    image = _load_gallery_image(db, image_id)
    return {"image": _gallery_out(image, settings, admin=True)}


@admin_router.patch("/{image_id}", response_model=GalleryEnvelope)
def update_gallery_image(
    image_id: str,
    payload: GalleryImagePatch,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    image = _load_gallery_image(db, image_id)
    changed = payload.model_fields_set
    if "mediaId" in changed:
        if payload.mediaId is None:
            raise HTTPException(status_code=422, detail="mediaId must not be null")
        media = _load_media(db, payload.mediaId)
        _ensure_unused_media(db, media.id, image_id=image.id)
        image.media_id = media.id
    if "title" in changed and payload.title is not None:
        image.title = payload.title
    if "caption" in changed and payload.caption is not None:
        image.caption = payload.caption
    if "alt" in changed:
        if payload.alt is None:
            raise HTTPException(status_code=422, detail="alt must not be null")
        image.alt_text = payload.alt
    if "order" in changed:
        if payload.order is None:
            raise HTTPException(status_code=422, detail="order must not be null")
        image.sort_order = payload.order
    audit(db, "gallery.update", "gallery_image", image.id, fields=sorted(changed))
    db.commit()
    image = _load_gallery_image(db, image.id)
    _invalidate_gallery(response)
    return {"image": _gallery_out(image, settings, admin=True)}


def _set_gallery_status(
    image_id: str,
    status: str,
    response: Response,
    db: Session,
    settings: Settings,
) -> dict[str, object]:
    image = _load_gallery_image(db, image_id)
    now = datetime.now(timezone.utc)
    image.status = status
    if status == "published":
        image.published_at = now
        image.archived_at = None
    else:
        image.archived_at = now
    audit(db, f"gallery.{status}", "gallery_image", image.id, mediaId=image.media_id)
    db.commit()
    image = _load_gallery_image(db, image.id)
    _invalidate_gallery(response)
    return {"image": _gallery_out(image, settings, admin=True)}


@admin_router.post("/{image_id}/publish", response_model=GalleryEnvelope)
def publish_gallery_image(
    image_id: str,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    return _set_gallery_status(image_id, "published", response, db, settings)


@admin_router.post("/{image_id}/archive", response_model=GalleryEnvelope)
def archive_gallery_image(
    image_id: str,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    return _set_gallery_status(image_id, "archived", response, db, settings)


@admin_router.delete("/{image_id}", status_code=204)
def delete_gallery_image(
    image_id: str,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> Response:
    image = _load_gallery_image(db, image_id)
    audit(db, "gallery.delete", "gallery_image", image.id, mediaId=image.media_id)
    db.delete(image)
    db.commit()
    response = Response(status_code=204)
    _invalidate_gallery(response)
    return response
