from __future__ import annotations

from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased, selectinload

from ..config import Settings, get_settings
from ..database import get_db
from ..models import Article, Comment, SlugRedirect, Tag, article_tags
from ..schemas import (
    ArticleEnvelope,
    CommentCreate,
    CommentEnvelope,
    PaginatedArticles,
    PaginatedComments,
    TagsList,
)
from ..security import client_address, daily_source_hash, verify_turnstile
from ..services import article_public, article_summary, aware, decode_cursor, encode_cursor


router = APIRouter(tags=["public"])


def _published_query(now: datetime):
    return and_(Article.status == "published", Article.published_at.is_not(None), Article.published_at <= now)


@router.get("/articles", response_model=PaginatedArticles)
def list_articles(
    q: str | None = Query(default=None, max_length=200),
    tag: str | None = Query(default=None, max_length=64),
    archive: int | None = Query(default=None, ge=2000, le=2200),
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    stmt = select(Article).options(selectinload(Article.tags), selectinload(Article.cover_media)).where(_published_query(now))
    if q and q.strip():
        term = q.strip()
        stmt = stmt.where(
            or_(
                Article.title.contains(term, autoescape=True),
                Article.summary.contains(term, autoescape=True),
                Article.content_text.contains(term, autoescape=True),
            )
        )
    if tag:
        stmt = stmt.join(article_tags).join(Tag).where(Tag.slug == tag)
    if archive:
        start = datetime(archive, 1, 1, tzinfo=timezone.utc)
        end = datetime(archive + 1, 1, 1, tzinfo=timezone.utc)
        stmt = stmt.where(Article.published_at >= start, Article.published_at < end)
    decoded = decode_cursor(cursor)
    if decoded:
        published_at, identifier = decoded
        stmt = stmt.where(
            or_(
                Article.published_at < published_at,
                and_(Article.published_at == published_at, Article.id < identifier),
            )
        )
    rows = list(db.scalars(stmt.order_by(Article.published_at.desc(), Article.id.desc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        next_cursor = encode_cursor(aware(items[-1].published_at), items[-1].id)  # type: ignore[arg-type]
    return {"items": [article_summary(item, settings) for item in items], "nextCursor": next_cursor}


@router.get("/tags", response_model=TagsList)
def list_tags(db: Session = Depends(get_db)) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Tag.name, Tag.slug, func.count(Article.id))
        .join(article_tags, article_tags.c.tag_id == Tag.id)
        .join(Article, Article.id == article_tags.c.article_id)
        .where(_published_query(now))
        .group_by(Tag.id)
        .order_by(Tag.name)
    ).all()
    return {"items": [{"name": name, "slug": slug, "count": count} for name, slug, count in rows]}


@router.get("/articles/{slug}", response_model=ArticleEnvelope)
def get_article(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object] | RedirectResponse:
    now = datetime.now(timezone.utc)
    article = db.scalar(
        select(Article)
        .options(selectinload(Article.tags), selectinload(Article.cover_media))
        .where(Article.slug == slug, _published_query(now))
    )
    if article is None:
        redirect = db.get(SlugRedirect, slug)
        if redirect:
            target = db.scalar(select(Article).where(Article.id == redirect.article_id, _published_query(now)))
            if target:
                route_base = "/v1" if request.url.path.startswith("/v1/") else "/api/articles/v1"
                return RedirectResponse(f"{route_base}/articles/{target.slug}", status_code=308)
        raise HTTPException(status_code=404, detail="article not found")
    return {"article": article_public(article, settings)}


def _comment_out(comment: Comment, *, include_replies: bool = True) -> dict[str, object]:
    deleted = comment.status == "deleted"
    data: dict[str, object] = {
        "id": comment.id,
        "parentId": comment.parent_id,
        "nickname": "已删除" if deleted else comment.nickname,
        "body": "此评论已删除。" if deleted else comment.body,
        "status": comment.status,
        "createdAt": aware(comment.created_at),
        "replies": [],
    }
    if include_replies:
        data["replies"] = [
            _comment_out(reply, include_replies=False)
            for reply in sorted(comment.replies, key=lambda item: (item.created_at, item.id))
            if reply.status == "visible"
        ]
    return data


@router.get("/articles/{slug}/comments", response_model=PaginatedComments)
def list_comments(
    slug: str,
    cursor: str | None = Query(default=None, max_length=1024),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    article = db.scalar(select(Article).where(Article.slug == slug, _published_query(now)))
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")
    reply_alias = aliased(Comment)
    has_visible_reply = (
        select(reply_alias.id)
        .where(reply_alias.parent_id == Comment.id, reply_alias.status == "visible")
        .exists()
    )
    stmt = (
        select(Comment)
        .options(selectinload(Comment.replies))
        .where(
            Comment.article_id == article.id,
            Comment.parent_id.is_(None),
            or_(Comment.status == "visible", and_(Comment.status == "deleted", has_visible_reply)),
        )
    )
    decoded = decode_cursor(cursor)
    if decoded:
        created_at, identifier = decoded
        stmt = stmt.where(or_(Comment.created_at > created_at, and_(Comment.created_at == created_at, Comment.id > identifier)))
    rows = list(db.scalars(stmt.order_by(Comment.created_at, Comment.id).limit(limit + 1)).all())
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [_comment_out(item) for item in items],
        "nextCursor": encode_cursor(aware(items[-1].created_at), items[-1].id) if has_more and items else None,
    }


@router.post("/articles/{slug}/comments", response_model=CommentEnvelope, status_code=201)
async def create_comment(
    slug: str,
    payload: CommentCreate,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    article = db.scalar(select(Article).where(Article.slug == slug, _published_query(now)))
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")
    address = client_address(request, settings)
    await verify_turnstile(payload.turnstileToken, address, settings)
    source_hash = daily_source_hash(address, settings, now)
    ten_minutes_ago = now - timedelta(minutes=10)
    recent_count = db.scalar(
        select(func.count(Comment.id)).where(Comment.source_hash == source_hash, Comment.created_at >= ten_minutes_ago)
    ) or 0
    daily_count = db.scalar(select(func.count(Comment.id)).where(Comment.source_hash == source_hash)) or 0
    if recent_count >= 5 or daily_count >= 30:
        raise HTTPException(status_code=429, detail="comment rate limit exceeded", headers={"Retry-After": "600"})

    parent: Comment | None = None
    if payload.parentId:
        parent = db.get(Comment, payload.parentId)
        if parent is None or parent.article_id != article.id or parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="replies may target only a top-level comment in this article")
        if parent.status == "hidden":
            raise HTTPException(status_code=422, detail="cannot reply to a hidden comment")
    comment = Comment(
        article_id=article.id,
        parent_id=parent.id if parent else None,
        nickname=payload.nickname,
        body=payload.body,
        source_hash=source_hash,
        status="visible",
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {"comment": _comment_out(comment)}


@router.get("/rss.xml")
def rss(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> Response:
    now = datetime.now(timezone.utc)
    articles = list(
        db.scalars(
            select(Article).where(_published_query(now)).order_by(Article.published_at.desc()).limit(50)
        ).all()
    )
    items: list[str] = []
    for article in articles:
        url = f"{settings.public_base_url}/articles/{article.slug}"
        published = aware(article.published_at).strftime("%a, %d %b %Y %H:%M:%S +0000")  # type: ignore[union-attr]
        items.append(
            "<item>"
            f"<title>{xml_escape(article.title)}</title>"
            f"<link>{xml_escape(url)}</link><guid>{xml_escape(url)}</guid>"
            f"<description>{xml_escape(article.summary)}</description>"
            f"<pubDate>{published}</pubDate>"
            "</item>"
        )
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel><title>ZongRui Articles</title>'
        f"<link>{xml_escape(settings.public_base_url + '/articles')}</link>"
        "<description>ZongRui 的文章</description>"
        + "".join(items)
        + "</channel></rss>"
    )
    return Response(body, media_type="application/rss+xml; charset=utf-8")


@router.get("/sitemap.xml")
def sitemap(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> Response:
    now = datetime.now(timezone.utc)
    articles = list(db.scalars(select(Article).where(_published_query(now)).order_by(Article.updated_at.desc())).all())
    urls = [
        f"<url><loc>{xml_escape(settings.public_base_url + '/articles')}</loc></url>"
    ]
    for article in articles:
        location = xml_escape(f"{settings.public_base_url}/articles/{article.slug}")
        last_modified = aware(article.updated_at).date().isoformat()  # type: ignore[union-attr]
        urls.append(f"<url><loc>{location}</loc><lastmod>{last_modified}</lastmod></url>")
    body = '<?xml version="1.0" encoding="UTF-8"?>' + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(urls) + "</urlset>"
    return Response(body, media_type="application/xml; charset=utf-8")
