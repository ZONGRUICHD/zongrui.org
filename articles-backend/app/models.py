from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


article_tags = Table(
    "article_tags",
    Base.metadata,
    Column("article_id", String(36), ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        Index("ix_articles_status_published", "status", "published_at"),
        Index("ix_articles_scheduled", "status", "scheduled_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(500), default="")
    cover_media_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("media.id", ondelete="SET NULL"), nullable=True
    )
    content_json: Mapped[str] = mapped_column(Text)
    content_html: Mapped[str] = mapped_column(Text, default="")
    content_text: Mapped[str] = mapped_column(Text, default="")
    writing_mode: Mapped[str] = mapped_column(String(16), default="horizontal", server_default="horizontal")
    content_language: Mapped[str] = mapped_column(String(16), default="zh-CN", server_default="zh-CN")
    reading_minutes: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    cover_media: Mapped[Media | None] = relationship(foreign_keys=[cover_media_id])
    tags: Mapped[list[Tag]] = relationship(secondary=article_tags, back_populates="articles", lazy="selectin")
    revisions: Mapped[list[ArticleRevision]] = relationship(
        back_populates="article", cascade="all, delete-orphan", passive_deletes=True
    )


class ArticleRevision(Base):
    __tablename__ = "article_revisions"
    __table_args__ = (UniqueConstraint("article_id", "revision", name="uq_article_revision"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    article_id: Mapped[str] = mapped_column(String(36), ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    snapshot_json: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(String(24), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    article: Mapped[Article] = relationship(back_populates="revisions")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    articles: Mapped[list[Article]] = relationship(secondary=article_tags, back_populates="tags")


class SlugRedirect(Base):
    __tablename__ = "slug_redirects"

    old_slug: Mapped[str] = mapped_column(String(160), primary_key=True)
    article_id: Mapped[str] = mapped_column(String(36), ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_article_created", "article_id", "created_at"),
        Index("ix_comments_source_created", "source_hash", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    article_id: Mapped[str] = mapped_column(String(36), ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    nickname: Mapped[str] = mapped_column(String(24))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="visible", index=True)
    source_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    parent: Mapped[Comment | None] = relationship(remote_side=[id], back_populates="replies")
    replies: Mapped[list[Comment]] = relationship(back_populates="parent", cascade="all, delete-orphan")


class Media(Base):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    path: Mapped[str] = mapped_column(String(255), unique=True)
    mime_type: Mapped[str] = mapped_column(String(64))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class GalleryImage(Base):
    __tablename__ = "gallery_images"
    __table_args__ = (
        UniqueConstraint("media_id", name="uq_gallery_images_media_id"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_gallery_images_status"),
        CheckConstraint("sort_order >= 0", name="ck_gallery_images_sort_order"),
        Index("ix_gallery_images_status_order", "status", "sort_order", "published_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    media_id: Mapped[str] = mapped_column(String(36), ForeignKey("media.id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    caption: Mapped[str] = mapped_column(String(2000), default="")
    alt_text: Mapped[str] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    media: Mapped[Media] = relationship()


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    github_user_id: Mapped[int] = mapped_column(BigInteger)
    github_login: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    return_to: Mapped[str] = mapped_column(String(255), default="/console")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class SiteVisitor(Base):
    __tablename__ = "site_visitors"

    # This is a keyed HMAC of the visitor address. The source address and user
    # agent are deliberately never persisted.
    visitor_hash: Mapped[str] = mapped_column(String(64), primary_key=True)


class ArticleReader(Base):
    __tablename__ = "article_readers"

    article_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    # Article digests use an article-specific HMAC context, so they cannot be
    # joined to the site-wide digest or to readers of a different article.
    visitor_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
