from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings
from .content import RenderedContent, render_document
from .models import Article, ArticleRevision, AuditLog, Media, SlugRedirect, Tag


SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def normalise_slug(value: str) -> str:
    value = value.strip().lower().replace("_", "-")
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    if not SLUG_RE.fullmatch(value) or len(value) > 160:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="slug must contain lowercase ASCII letters, numbers, and single hyphens",
        )
    return value


def generated_slug(title: str) -> str:
    ascii_words = re.findall(r"[a-z0-9]+", title.lower())
    candidate = "-".join(ascii_words)[:140].strip("-")
    return candidate if candidate else f"article-{secrets.token_hex(4)}"


def tag_slug(name: str) -> str:
    words = re.findall(r"[a-z0-9]+", name.lower())
    if words:
        return "-".join(words)[:52]
    digest = hashlib.sha256(name.casefold().encode()).hexdigest()[:12]
    return f"tag-{digest}"


def ensure_unique_slug(db: Session, value: str, *, article_id: str | None = None) -> str:
    candidate = normalise_slug(value)
    existing = db.scalar(select(Article).where(Article.slug == candidate))
    redirect = db.get(SlugRedirect, candidate)
    if (existing and existing.id != article_id) or (redirect and redirect.article_id != article_id):
        raise HTTPException(status_code=409, detail="slug is already in use")
    return candidate


def resolve_tags(db: Session, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in names:
        existing = db.scalar(select(Tag).where(func.lower(Tag.name) == name.casefold()))
        if existing:
            tags.append(existing)
            continue
        base_slug = tag_slug(name)
        slug = base_slug
        suffix = 2
        while db.scalar(select(Tag.id).where(Tag.slug == slug)) is not None:
            slug = f"{base_slug[:56]}-{suffix}"
            suffix += 1
        tag = Tag(name=name, slug=slug)
        db.add(tag)
        tags.append(tag)
    return tags


def render_content(document: dict[str, Any], settings: Settings) -> RenderedContent:
    try:
        return render_document(document, settings.media_public_base_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def snapshot_payload(article: Article) -> dict[str, Any]:
    return {
        "slug": article.slug,
        "status": article.status,
        "title": article.title,
        "summary": article.summary,
        "coverMediaId": article.cover_media_id,
        "tags": [tag.name for tag in article.tags],
        "contentJson": json.loads(article.content_json),
        "contentHtml": article.content_html,
        "contentText": article.content_text,
        "writingMode": article.writing_mode,
        "readingMinutes": article.reading_minutes,
        "publishedAt": aware(article.published_at).isoformat() if article.published_at else None,
        "scheduledAt": aware(article.scheduled_at).isoformat() if article.scheduled_at else None,
    }


def create_revision(db: Session, article: Article, reason: str) -> ArticleRevision:
    revision = ArticleRevision(
        article_id=article.id,
        revision=article.revision,
        snapshot_json=json.dumps(snapshot_payload(article), ensure_ascii=False, separators=(",", ":")),
        reason=reason,
    )
    db.add(revision)
    return revision


def audit(db: Session, action: str, entity_type: str, entity_id: str | None, **details: Any) -> None:
    safe_details = {key: value for key, value in details.items() if key not in {"body", "content", "contentJson"}}
    db.add(
        AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details_json=json.dumps(safe_details, ensure_ascii=False, separators=(",", ":")),
        )
    )


def cover_url(article: Article, settings: Settings) -> str | None:
    return media_url(article.cover_media, settings) if article.cover_media else None


def media_url(media: Media, settings: Settings) -> str:
    return f"{settings.media_public_base_url}/{media.path}"


def article_summary(article: Article, settings: Settings) -> dict[str, Any]:
    return {
        "id": article.id,
        "slug": article.slug,
        "title": article.title,
        "summary": article.summary,
        "coverUrl": cover_url(article, settings),
        "tags": [tag.name for tag in sorted(article.tags, key=lambda item: item.name.casefold())],
        "writingMode": article.writing_mode,
        "readingMinutes": article.reading_minutes,
        "publishedAt": aware(article.published_at),
        "updatedAt": aware(article.updated_at),
    }


def article_public(article: Article, settings: Settings) -> dict[str, Any]:
    return {**article_summary(article, settings), "contentHtml": article.content_html}


def article_admin(article: Article, settings: Settings) -> dict[str, Any]:
    return {
        **article_public(article, settings),
        "status": article.status,
        "contentJson": json.loads(article.content_json),
        "scheduledAt": aware(article.scheduled_at),
        "createdAt": aware(article.created_at),
        "revision": article.revision,
    }


def encode_cursor(timestamp: datetime, identifier: str) -> str:
    raw = json.dumps([aware(timestamp).isoformat(), identifier], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[datetime, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        timestamp_text, identifier = json.loads(raw)
        timestamp = datetime.fromisoformat(timestamp_text)
        if timestamp.tzinfo is None or not isinstance(identifier, str):
            raise ValueError
        return timestamp, identifier
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="invalid cursor") from exc


def verify_revision(article: Article, expected: int) -> None:
    if article.revision != expected:
        raise HTTPException(
            status_code=409,
            detail={"code": "revision_conflict", "currentRevision": article.revision},
        )
