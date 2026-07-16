from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from .database import SessionLocal
from .models import Article, Comment
from .services import audit, create_revision


def publish_due() -> int:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        articles = list(
            db.scalars(
                select(Article).where(
                    Article.status == "scheduled",
                    Article.scheduled_at.is_not(None),
                    Article.scheduled_at <= now,
                )
            ).all()
        )
        for article in articles:
            article.status = "published"
            article.published_at = article.published_at or now
            article.scheduled_at = None
            article.revision += 1
            create_revision(db, article, "scheduled-publish")
            audit(db, "article.scheduled-publish", "article", article.id, revision=article.revision)
        db.execute(
            update(Comment)
            .where(
                Comment.source_hash.is_not(None),
                Comment.created_at < now - timedelta(hours=48),
            )
            .values(source_hash=None)
        )
        db.commit()
        return len(articles)


if __name__ == "__main__":
    print(f"published {publish_due()} article(s)")
