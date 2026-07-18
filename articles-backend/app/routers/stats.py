from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..models import Article, ArticleReader, SiteVisitor
from ..schemas import VisitorStats
from ..security import (
    client_address,
    is_obvious_bot,
    stable_visitor_hash,
    statistics_cross_site,
    statistics_opted_out,
)
from ..services import aware


router = APIRouter(prefix="/stats", tags=["statistics"])


def _published_article(db: Session, slug: str, now: datetime) -> Article | None:
    return db.scalar(
        select(Article).where(
            Article.slug == slug,
            Article.status == "published",
            Article.published_at.is_not(None),
            Article.published_at <= now,
        )
    )


def _request_visitor_hash(request: Request, settings: Settings, context: str) -> str | None:
    if is_obvious_bot(request) or statistics_opted_out(request) or statistics_cross_site(request, settings):
        return None
    return stable_visitor_hash(client_address(request, settings), settings, context)


def _site_stats(
    db: Session,
    visitor_hash: str | None,
    settings: Settings,
    *,
    counted: bool | None = None,
) -> dict[str, object]:
    unique_visitors = db.scalar(select(func.count(SiteVisitor.visitor_hash))) or 0
    if counted is None:
        counted = bool(
            visitor_hash
            and db.scalar(select(SiteVisitor.visitor_hash).where(SiteVisitor.visitor_hash == visitor_hash))
        )
    return {
        "uniqueVisitors": unique_visitors,
        "counted": counted,
        "since": aware(settings.statistics_started_at),
    }


def _article_stats(
    db: Session,
    article: Article,
    visitor_hash: str | None,
    settings: Settings,
    *,
    counted: bool | None = None,
) -> dict[str, object]:
    unique_visitors = db.scalar(
        select(func.count(ArticleReader.visitor_hash)).where(ArticleReader.article_id == article.id)
    ) or 0
    if counted is None:
        counted = bool(
            visitor_hash
            and db.scalar(
                select(ArticleReader.visitor_hash).where(
                    ArticleReader.article_id == article.id,
                    ArticleReader.visitor_hash == visitor_hash,
                )
            )
        )
    return {
        "uniqueVisitors": unique_visitors,
        "counted": counted,
        "since": aware(settings.statistics_started_at),
    }


@router.get("/site", response_model=VisitorStats)
def site_stats(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    return _site_stats(db, _request_visitor_hash(request, settings, "statistics:site:v1"), settings)


@router.post("/site", response_model=VisitorStats)
def record_site_visit(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    visitor_hash = _request_visitor_hash(request, settings, "statistics:site:v1")
    if visitor_hash is None:
        return _site_stats(db, None, settings, counted=False)

    if db.get(SiteVisitor, visitor_hash) is not None:
        return _site_stats(db, visitor_hash, settings, counted=False)

    result = db.execute(
        sqlite_insert(SiteVisitor)
        .values(visitor_hash=visitor_hash)
        .on_conflict_do_nothing(index_elements=["visitor_hash"])
    )
    db.commit()
    return _site_stats(db, visitor_hash, settings, counted=result.rowcount == 1)


@router.get("/articles/{slug}", response_model=VisitorStats)
def article_stats(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    article = _published_article(db, slug, datetime.now(timezone.utc))
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")
    return _article_stats(
        db,
        article,
        _request_visitor_hash(request, settings, f"statistics:article:{article.id}:v1"),
        settings,
    )


@router.post("/articles/{slug}", response_model=VisitorStats)
def record_article_read(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    article = _published_article(db, slug, now)
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")

    site_visitor_hash = _request_visitor_hash(request, settings, "statistics:site:v1")
    article_visitor_hash = _request_visitor_hash(
        request,
        settings,
        f"statistics:article:{article.id}:v1",
    )
    if site_visitor_hash is None or article_visitor_hash is None:
        return _article_stats(db, article, None, settings, counted=False)

    site_exists = db.get(SiteVisitor, site_visitor_hash) is not None
    article_exists = db.get(ArticleReader, (article.id, article_visitor_hash)) is not None
    if site_exists and article_exists:
        return _article_stats(db, article, article_visitor_hash, settings, counted=False)

    if not site_exists:
        db.execute(
            sqlite_insert(SiteVisitor)
            .values(visitor_hash=site_visitor_hash)
            .on_conflict_do_nothing(index_elements=["visitor_hash"])
        )
    result = None
    if not article_exists:
        result = db.execute(
            sqlite_insert(ArticleReader)
            .values(article_id=article.id, visitor_hash=article_visitor_hash)
            .on_conflict_do_nothing(index_elements=["article_id", "visitor_hash"])
        )
    db.commit()
    return _article_stats(
        db,
        article,
        article_visitor_hash,
        settings,
        counted=bool(result and result.rowcount == 1),
    )
