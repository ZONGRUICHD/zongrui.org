"""Add the managed public image gallery."""

from alembic import op
import sqlalchemy as sa


revision = "0005_public_gallery"
down_revision = "0004_article_content_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gallery_images",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("caption", sa.String(length=2000), nullable=False),
        sa.Column("alt_text", sa.String(length=300), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_gallery_images_status",
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_gallery_images_sort_order"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("media_id", name="uq_gallery_images_media_id"),
    )
    op.create_index(
        "ix_gallery_images_media_id", "gallery_images", ["media_id"], unique=False
    )
    op.create_index(
        "ix_gallery_images_status", "gallery_images", ["status"], unique=False
    )
    op.create_index(
        "ix_gallery_images_status_order",
        "gallery_images",
        ["status", "sort_order", "published_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("gallery_images")
