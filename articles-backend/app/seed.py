from __future__ import annotations

import json

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import Article
from .services import create_revision, render_content, resolve_tags


INTRO_DOCUMENT = {
    "type": "doc",
    "content": [
        {
            "type": "heading",
            "attrs": {"level": 2},
            "content": [{"type": "text", "text": "ZongRui"}],
        },
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Rust、RoboMaster、Linux。"}],
        },
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Programming in Ciallo～(∠・ω< )⌒★"}],
        },
    ],
}


def seed() -> bool:
    settings = get_settings()
    with SessionLocal() as db:
        if db.scalar(select(Article.id).where(Article.slug == "about-me")) is not None:
            return False
        rendered = render_content(INTRO_DOCUMENT, settings)
        article = Article(
            slug="about-me",
            status="draft",
            title="关于我",
            summary="Rust、机器人和最近在折腾的东西。",
            content_json=json.dumps(rendered.document, ensure_ascii=False, separators=(",", ":")),
            content_html=rendered.html,
            content_text=rendered.text,
            reading_minutes=rendered.reading_minutes,
            revision=1,
            tags=resolve_tags(db, ["Rust", "RoboMaster", "Linux"]),
        )
        db.add(article)
        db.flush()
        create_revision(db, article, "seed")
        db.commit()
        return True


if __name__ == "__main__":
    print("created initial draft" if seed() else "initial draft already exists")
