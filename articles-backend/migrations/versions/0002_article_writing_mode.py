"""Add the article reading direction and writing mode."""

from alembic import op
import sqlalchemy as sa


revision = "0002_article_writing_mode"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column(
            "writing_mode",
            sa.String(length=16),
            nullable=False,
            server_default="horizontal",
        ),
    )


def downgrade() -> None:
    op.drop_column("articles", "writing_mode")
