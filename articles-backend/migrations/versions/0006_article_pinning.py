"""Add article pinning."""

from alembic import op
import sqlalchemy as sa


revision = "0006_article_pinning"
down_revision = "0005_public_gallery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index(
        "ix_articles_status_pinned_published",
        "articles",
        ["status", "is_pinned", "published_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_articles_status_pinned_published", table_name="articles")
    op.drop_column("articles", "is_pinned")
