from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Article, Comment
from app.scheduler import publish_due
from app.seed import seed


def test_seed_is_idempotent_and_keeps_intro_draft() -> None:
    assert seed() is True
    assert seed() is False
    with SessionLocal() as db:
        article = db.scalar(select(Article).where(Article.slug == "about-me"))
        assert article is not None
        assert article.status == "draft"
        assert "Programming in Ciallo" in article.content_text


def test_scheduler_publishes_due_article() -> None:
    assert seed() is True
    with SessionLocal() as db:
        article = db.scalar(select(Article).where(Article.slug == "about-me"))
        assert article is not None
        article.status = "scheduled"
        article.scheduled_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert publish_due() == 1
    with SessionLocal() as db:
        article = db.scalar(select(Article).where(Article.slug == "about-me"))
        assert article is not None
        assert article.status == "published"
        assert article.published_at is not None


def test_scheduler_clears_expired_comment_source_hashes() -> None:
    assert seed() is True
    with SessionLocal() as db:
        article = db.scalar(select(Article).where(Article.slug == "about-me"))
        assert article is not None
        comment = Comment(
            article_id=article.id,
            nickname="tester",
            body="hello",
            source_hash="a" * 64,
            created_at=datetime.now(timezone.utc) - timedelta(hours=49),
        )
        db.add(comment)
        db.commit()
        comment_id = comment.id

    assert publish_due() == 0
    with SessionLocal() as db:
        comment = db.get(Comment, comment_id)
        assert comment is not None
        assert comment.source_hash is None
