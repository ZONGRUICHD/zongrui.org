from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import Settings, get_settings
from ..database import get_db
from ..media import process_upload, safe_media_path
from ..models import AdminSession, Article, ArticleRevision, Comment, Media, SlugRedirect
from ..schemas import (
    AdminArticleEnvelope,
    ArticlePatch,
    ArticleWrite,
    MediaEnvelope,
    PaginatedAdminArticles,
    PaginatedMedia,
    RevisionAction,
    RevisionList,
    ScheduleAction,
)
from ..security import require_csrf, get_admin_session
from ..services import (
    article_admin,
    audit,
    aware,
    create_revision,
    decode_cursor,
    encode_cursor,
    ensure_unique_slug,
    generated_slug,
    media_url,
    render_content,
    resolve_tags,
    verify_revision,
)


router = APIRouter(prefix="/admin", tags=["admin"])


def _load_article(db: Session, article_id: str) -> Article:
    article = db.scalar(
        select(Article)
        .options(selectinload(Article.tags), selectinload(Article.cover_media))
        .where(Article.id == article_id)
    )
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")
    return article


def _get_media(db: Session, media_id: str | None) -> Media | None:
    if media_id is None:
        return None
    media = db.get(Media, media_id)
    if media is None:
        raise HTTPException(status_code=422, detail="cover media does not exist")
    return media


def _get_media_by_url(db: Session, url: str | None, settings: Settings) -> Media | None:
    if url is None or not url.strip():
        return None
    parsed = urlparse(url.strip())
    expected = urlparse(settings.media_public_base_url)
    if parsed.scheme != "https" or parsed.netloc != expected.netloc or parsed.query or parsed.fragment:
        raise HTTPException(status_code=422, detail="coverUrl must point to uploaded media")
    expected_prefix = expected.path.rstrip("/")
    if expected_prefix and not parsed.path.startswith(expected_prefix + "/"):
        raise HTTPException(status_code=422, detail="coverUrl is outside the media prefix")
    relative_path = parsed.path[len(expected_prefix) :].lstrip("/") if expected_prefix else parsed.path.lstrip("/")
    media = db.scalar(select(Media).where(Media.path == relative_path))
    if media is None:
        raise HTTPException(status_code=422, detail="coverUrl does not match uploaded media")
    return media


def _etag(response: Response, article: Article) -> None:
    response.headers["ETag"] = f'"revision-{article.revision}"'
    response.headers["Cache-Control"] = "no-store"


def _invalidate(response: Response, article: Article, db: Session) -> None:
    slugs = {article.slug, *db.scalars(select(SlugRedirect.old_slug).where(SlugRedirect.article_id == article.id)).all()}
    paths = ["/v1/articles", "/v1/tags", "/v1/rss.xml", "/v1/sitemap.xml", "/articles"]
    for slug in sorted(slugs):
        paths.extend((f"/v1/articles/{slug}", f"/articles/{slug}"))
    response.headers["X-ZR-Cache-Invalidate"] = ",".join(paths)


@router.get("/articles", response_model=PaginatedAdminArticles)
def list_admin_articles(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(draft|scheduled|published|archived)$"),
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=20, ge=1, le=50),
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    stmt = select(Article).options(selectinload(Article.tags), selectinload(Article.cover_media))
    if status_filter:
        stmt = stmt.where(Article.status == status_filter)
    decoded = decode_cursor(cursor)
    if decoded:
        updated_at, identifier = decoded
        stmt = stmt.where(or_(Article.updated_at < updated_at, and_(Article.updated_at == updated_at, Article.id < identifier)))
    rows = list(db.scalars(stmt.order_by(Article.updated_at.desc(), Article.id.desc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [article_admin(item, settings) for item in items],
        "nextCursor": encode_cursor(aware(items[-1].updated_at), items[-1].id) if has_more and items else None,
    }


@router.post("/articles", response_model=AdminArticleEnvelope, status_code=201)
def create_article(
    payload: ArticleWrite,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    rendered = render_content(payload.contentJson, settings)
    slug = ensure_unique_slug(db, payload.slug or generated_slug(payload.title))
    if payload.coverMediaId and payload.coverUrl:
        raise HTTPException(status_code=422, detail="send coverMediaId or coverUrl, not both")
    cover = _get_media(db, payload.coverMediaId) if payload.coverMediaId else _get_media_by_url(db, payload.coverUrl, settings)
    article = Article(
        slug=slug,
        status="draft",
        title=payload.title,
        summary=payload.summary,
        cover_media_id=cover.id if cover else None,
        content_json=json.dumps(rendered.document, ensure_ascii=False, separators=(",", ":")),
        content_html=rendered.html,
        content_text=rendered.text,
        reading_minutes=rendered.reading_minutes,
        revision=1,
        tags=resolve_tags(db, payload.tags),
    )
    db.add(article)
    db.flush()
    create_revision(db, article, "manual")
    audit(db, "article.create", "article", article.id, revision=article.revision)
    db.commit()
    article = _load_article(db, article.id)
    _etag(response, article)
    return {"article": article_admin(article, settings)}


@router.get("/articles/{article_id}", response_model=AdminArticleEnvelope)
def get_admin_article(
    article_id: str,
    response: Response,
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _load_article(db, article_id)
    _etag(response, article)
    return {"article": article_admin(article, settings)}


@router.patch("/articles/{article_id}", response_model=AdminArticleEnvelope)
def update_article(
    article_id: str,
    payload: ArticlePatch,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _load_article(db, article_id)
    verify_revision(article, payload.revision)
    changed_fields = payload.model_fields_set
    if "title" in changed_fields and payload.title is not None:
        article.title = payload.title
    if "summary" in changed_fields and payload.summary is not None:
        article.summary = payload.summary
    if "contentJson" in changed_fields and payload.contentJson is not None:
        rendered = render_content(payload.contentJson, settings)
        article.content_json = json.dumps(rendered.document, ensure_ascii=False, separators=(",", ":"))
        article.content_html = rendered.html
        article.content_text = rendered.text
        article.reading_minutes = rendered.reading_minutes
    if "tags" in changed_fields and payload.tags is not None:
        article.tags = resolve_tags(db, payload.tags)
    if payload.clearCover:
        article.cover_media_id = None
    elif "coverMediaId" in changed_fields and "coverUrl" in changed_fields and payload.coverMediaId and payload.coverUrl:
        raise HTTPException(status_code=422, detail="send coverMediaId or coverUrl, not both")
    elif "coverMediaId" in changed_fields:
        cover = _get_media(db, payload.coverMediaId)
        article.cover_media_id = cover.id if cover else None
    elif "coverUrl" in changed_fields:
        cover = _get_media_by_url(db, payload.coverUrl, settings)
        article.cover_media_id = cover.id if cover else None
    if "slug" in changed_fields and payload.slug is not None:
        new_slug = ensure_unique_slug(db, payload.slug, article_id=article.id)
        if new_slug != article.slug:
            old_slug = article.slug
            historical_target = db.get(SlugRedirect, new_slug)
            if historical_target and historical_target.article_id == article.id:
                db.delete(historical_target)
                db.flush()
            article.slug = new_slug
            if article.published_at is not None:
                existing_redirect = db.get(SlugRedirect, old_slug)
                if existing_redirect:
                    existing_redirect.article_id = article.id
                else:
                    db.add(SlugRedirect(old_slug=old_slug, article_id=article.id))
    article.revision += 1
    if payload.reason == "manual":
        create_revision(db, article, "manual")
    elif payload.checkpoint:
        latest_checkpoint = db.scalar(
            select(ArticleRevision.created_at)
            .where(ArticleRevision.article_id == article.id, ArticleRevision.reason == "autosave")
            .order_by(ArticleRevision.created_at.desc())
            .limit(1)
        )
        if latest_checkpoint is None or aware(latest_checkpoint) <= datetime.now(timezone.utc) - timedelta(minutes=5):
            create_revision(db, article, "autosave")
    audit(db, "article.update", "article", article.id, revision=article.revision, reason=payload.reason)
    db.commit()
    article = _load_article(db, article.id)
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


def _transition(
    db: Session,
    article: Article,
    expected_revision: int,
    new_status: str,
    action: str,
    *,
    scheduled_at: datetime | None = None,
) -> Article:
    verify_revision(article, expected_revision)
    now = datetime.now(timezone.utc)
    article.status = new_status
    article.scheduled_at = scheduled_at
    if new_status == "published" and article.published_at is None:
        article.published_at = now
    article.revision += 1
    create_revision(db, article, action)
    audit(db, f"article.{action}", "article", article.id, revision=article.revision)
    db.commit()
    return _load_article(db, article.id)


@router.post("/articles/{article_id}/publish", response_model=AdminArticleEnvelope)
def publish_article(
    article_id: str,
    payload: RevisionAction,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _transition(db, _load_article(db, article_id), payload.revision, "published", "publish")
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


@router.post("/articles/{article_id}/unpublish", response_model=AdminArticleEnvelope)
def unpublish_article(
    article_id: str,
    payload: RevisionAction,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _transition(db, _load_article(db, article_id), payload.revision, "draft", "unpublish")
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


@router.post("/articles/{article_id}/archive", response_model=AdminArticleEnvelope)
def archive_article(
    article_id: str,
    payload: RevisionAction,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _transition(db, _load_article(db, article_id), payload.revision, "archived", "archive")
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


@router.post("/articles/{article_id}/schedule", response_model=AdminArticleEnvelope)
def schedule_article(
    article_id: str,
    payload: ScheduleAction,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    scheduled_at = payload.scheduledAt
    if scheduled_at.tzinfo is None:
        raise HTTPException(status_code=422, detail="scheduledAt must include a timezone")
    if scheduled_at.astimezone(timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="scheduledAt must be in the future")
    article = _transition(
        db,
        _load_article(db, article_id),
        payload.revision,
        "scheduled",
        "schedule",
        scheduled_at=scheduled_at,
    )
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


@router.get("/articles/{article_id}/revisions", response_model=RevisionList)
def list_revisions(
    article_id: str,
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _load_article(db, article_id)
    revisions = list(
        db.scalars(
            select(ArticleRevision)
            .where(ArticleRevision.article_id == article_id)
            .order_by(ArticleRevision.revision.desc())
            .limit(100)
        ).all()
    )
    return {
        "items": [
            {
                "id": str(item.id),
                "revision": item.revision,
                "reason": item.reason,
                "createdAt": aware(item.created_at),
                "title": json.loads(item.snapshot_json).get("title", ""),
                "summary": json.loads(item.snapshot_json).get("summary", ""),
            }
            for item in revisions
        ]
    }


@router.post("/articles/{article_id}/revisions/{target_revision}/restore", response_model=AdminArticleEnvelope)
def restore_revision(
    article_id: str,
    target_revision: int,
    payload: RevisionAction,
    response: Response,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _load_article(db, article_id)
    verify_revision(article, payload.revision)
    stored = db.scalar(
        select(ArticleRevision).where(
            ArticleRevision.article_id == article.id,
            ArticleRevision.revision == target_revision,
        )
    )
    if stored is None:
        raise HTTPException(status_code=404, detail="revision not found")
    snapshot = json.loads(stored.snapshot_json)
    target_slug = ensure_unique_slug(db, snapshot["slug"], article_id=article.id)
    if target_slug != article.slug:
        old_slug = article.slug
        historical_target = db.get(SlugRedirect, target_slug)
        if historical_target and historical_target.article_id == article.id:
            db.delete(historical_target)
            db.flush()
        article.slug = target_slug
        if article.published_at is not None and db.get(SlugRedirect, old_slug) is None:
            db.add(SlugRedirect(old_slug=old_slug, article_id=article.id))
    article.title = snapshot["title"]
    article.summary = snapshot["summary"]
    restored_cover_id = snapshot.get("coverMediaId")
    article.cover_media_id = restored_cover_id if restored_cover_id and db.get(Media, restored_cover_id) else None
    article.tags = resolve_tags(db, snapshot.get("tags", []))
    rendered = render_content(snapshot["contentJson"], settings)
    article.content_json = json.dumps(rendered.document, ensure_ascii=False, separators=(",", ":"))
    article.content_html = rendered.html
    article.content_text = rendered.text
    article.reading_minutes = rendered.reading_minutes
    article.revision += 1
    create_revision(db, article, "restore")
    audit(db, "article.restore", "article", article.id, revision=article.revision, restoredRevision=target_revision)
    db.commit()
    article = _load_article(db, article.id)
    _etag(response, article)
    _invalidate(response, article, db)
    return {"article": article_admin(article, settings)}


def _media_out(media: Media, settings: Settings) -> dict[str, object]:
    return {
        "id": media.id,
        "url": media_url(media, settings),
        "mimeType": media.mime_type,
        "width": media.width,
        "height": media.height,
        "size": media.size_bytes,
        "sha256": media.sha256,
        "createdAt": aware(media.created_at),
    }


@router.get("/media", response_model=PaginatedMedia)
def list_media(
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=30, ge=1, le=100),
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    stmt = select(Media)
    decoded = decode_cursor(cursor)
    if decoded:
        created_at, identifier = decoded
        stmt = stmt.where(or_(Media.created_at < created_at, and_(Media.created_at == created_at, Media.id < identifier)))
    rows = list(db.scalars(stmt.order_by(Media.created_at.desc(), Media.id.desc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [_media_out(item, settings) for item in items],
        "nextCursor": encode_cursor(aware(items[-1].created_at), items[-1].id) if has_more and items else None,
    }


@router.post("/media", response_model=MediaEnvelope, status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    media = await process_upload(file, db, settings)
    audit(db, "media.upload", "media", media.id, sha256=media.sha256, size=media.size_bytes)
    db.commit()
    db.refresh(media)
    return {"media": _media_out(media, settings)}


@router.delete("/media/{media_id}", status_code=204)
def delete_media(
    media_id: str,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    media = db.get(Media, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="media not found")
    if db.scalar(select(func.count(Article.id)).where(Article.cover_media_id == media.id)):
        raise HTTPException(status_code=409, detail="media is used as an article cover")
    url = media_url(media, settings)
    if db.scalar(select(func.count(Article.id)).where(Article.content_html.contains(url, autoescape=True))):
        raise HTTPException(status_code=409, detail="media is used in article content")
    path = safe_media_path(media.path, settings)
    audit(db, "media.delete", "media", media.id, sha256=media.sha256)
    db.delete(media)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # The DB is authoritative. A failed unlink is safe to retry during maintenance.
        pass
    return Response(status_code=204)


def _admin_comment_out(comment: Comment, article: Article) -> dict[str, object]:
    return {
        "id": comment.id,
        "parentId": comment.parent_id,
        "nickname": comment.nickname,
        "body": comment.body,
        "status": comment.status,
        "createdAt": aware(comment.created_at),
        "replies": [],
        "article": {"id": article.id, "slug": article.slug, "title": article.title},
    }


@router.get("/comments")
def list_admin_comments(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(visible|hidden|deleted)$"),
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=30, ge=1, le=100),
    _admin: AdminSession = Depends(get_admin_session),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Comment, Article).join(Article, Article.id == Comment.article_id)
    if status_filter:
        stmt = stmt.where(Comment.status == status_filter)
    decoded = decode_cursor(cursor)
    if decoded:
        created_at, identifier = decoded
        stmt = stmt.where(or_(Comment.created_at < created_at, and_(Comment.created_at == created_at, Comment.id < identifier)))
    rows = db.execute(stmt.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [_admin_comment_out(comment, article) for comment, article in items],
        "nextCursor": encode_cursor(aware(items[-1][0].created_at), items[-1][0].id) if has_more and items else None,
    }


def _moderate_comment(comment_id: str, new_status: str, db: Session) -> tuple[Comment, Article]:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="comment not found")
    article = db.get(Article, comment.article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")
    comment.status = new_status
    audit(db, f"comment.{new_status}", "comment", comment.id, articleId=article.id)
    db.commit()
    db.refresh(comment)
    return comment, article


@router.post("/comments/{comment_id}/hide")
def hide_comment(
    comment_id: str,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    comment, article = _moderate_comment(comment_id, "hidden", db)
    return {"comment": _admin_comment_out(comment, article)}


@router.post("/comments/{comment_id}/restore")
def restore_comment(
    comment_id: str,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    comment, article = _moderate_comment(comment_id, "visible", db)
    return {"comment": _admin_comment_out(comment, article)}


@router.post("/comments/{comment_id}/delete")
def soft_delete_comment(
    comment_id: str,
    _admin: AdminSession = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    comment, article = _moderate_comment(comment_id, "deleted", db)
    return {"comment": _admin_comment_out(comment, article)}
