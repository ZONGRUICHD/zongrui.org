"""Add privacy-preserving unique visitor statistics."""

from alembic import op
import sqlalchemy as sa


revision = "0003_unique_visitor_stats"
down_revision = "0002_article_writing_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_visitors",
        sa.Column("visitor_hash", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("visitor_hash"),
    )
    op.create_table(
        "article_readers",
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("visitor_hash", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("article_id", "visitor_hash"),
    )


def downgrade() -> None:
    op.drop_table("article_readers")
    op.drop_table("site_visitors")
