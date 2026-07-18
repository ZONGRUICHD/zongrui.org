"""Store article language separately from its visual writing mode."""

from alembic import op
import sqlalchemy as sa


revision = "0004_article_content_language"
down_revision = "0003_unique_visitor_stats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column(
            "content_language",
            sa.String(length=16),
            nullable=False,
            server_default="zh-CN",
        ),
    )
    op.execute("UPDATE articles SET content_language = 'zh-Hant' WHERE writing_mode = 'vertical-rl'")


def downgrade() -> None:
    op.drop_column("articles", "content_language")
