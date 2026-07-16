from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class TagOut(ApiModel):
    name: str
    slug: str
    count: int | None = None


class ArticleSummaryOut(ApiModel):
    id: str
    slug: str
    title: str
    summary: str
    coverUrl: str | None = None
    tags: list[str]
    readingMinutes: int
    publishedAt: datetime | None
    updatedAt: datetime


class ArticleOut(ArticleSummaryOut):
    contentHtml: str


class AdminArticleOut(ArticleOut):
    status: Literal["draft", "scheduled", "published", "archived"]
    contentJson: dict[str, Any]
    scheduledAt: datetime | None
    createdAt: datetime
    revision: int


class ArticleWrite(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str = Field(default="", max_length=500)
    coverMediaId: str | None = None
    coverUrl: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=12)
    contentJson: dict[str, Any]
    reason: Literal["manual", "autosave"] = "manual"
    checkpoint: bool = False

    @field_validator("title", "summary")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            value = " ".join(value.split()).strip()
            if not value or len(value) > 50:
                raise ValueError("tags must contain 1 to 50 characters")
            key = value.casefold()
            if key not in seen:
                result.append(value)
                seen.add(key)
        return result


class ArticlePatch(ApiModel):
    revision: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=500)
    coverMediaId: str | None = None
    coverUrl: str | None = Field(default=None, max_length=500)
    clearCover: bool = False
    tags: list[str] | None = Field(default=None, max_length=12)
    contentJson: dict[str, Any] | None = None
    reason: Literal["manual", "autosave"] = "manual"
    checkpoint: bool = False

    @field_validator("title", "summary")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("tags")
    @classmethod
    def clean_optional_tags(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return ArticleWrite.clean_tags(values)


class RevisionAction(ApiModel):
    revision: int = Field(ge=1)


class ScheduleAction(RevisionAction):
    scheduledAt: datetime


class RevisionOut(ApiModel):
    id: str
    revision: int
    reason: str
    createdAt: datetime
    title: str
    summary: str


class CommentCreate(ApiModel):
    nickname: str = Field(min_length=1, max_length=24)
    body: str = Field(min_length=1, max_length=2000)
    parentId: str | None = None
    turnstileToken: str = Field(min_length=1, max_length=4096)

    @field_validator("nickname", "body")
    @classmethod
    def clean_comment_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        if any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("contains unsupported control characters")
        return value


class CommentOut(ApiModel):
    id: str
    parentId: str | None
    nickname: str
    body: str
    status: Literal["visible", "hidden", "deleted"]
    createdAt: datetime
    replies: list[CommentOut] = Field(default_factory=list)


class CommentStatusAction(ApiModel):
    status: Literal["visible", "hidden", "deleted"]


class MediaOut(ApiModel):
    id: str
    url: str
    mimeType: str
    width: int
    height: int
    size: int
    sha256: str
    createdAt: datetime


class SessionOut(ApiModel):
    authenticated: bool
    user: dict[str, Any] | None = None
    turnstileSiteKey: str | None = None


class PaginatedArticles(ApiModel):
    items: list[ArticleSummaryOut]
    nextCursor: str | None


class PaginatedAdminArticles(ApiModel):
    items: list[AdminArticleOut]
    nextCursor: str | None


class PaginatedComments(ApiModel):
    items: list[CommentOut]
    nextCursor: str | None


class PaginatedMedia(ApiModel):
    items: list[MediaOut]
    nextCursor: str | None


class RevisionList(ApiModel):
    items: list[RevisionOut]


class TagsList(ApiModel):
    items: list[TagOut]


class ArticleEnvelope(ApiModel):
    article: ArticleOut


class AdminArticleEnvelope(ApiModel):
    article: AdminArticleOut


class CommentEnvelope(ApiModel):
    comment: CommentOut


class MediaEnvelope(ApiModel):
    media: MediaOut
