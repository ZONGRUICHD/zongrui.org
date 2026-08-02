"""Add the editable homepage profile."""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0007_site_profile"
down_revision = "0006_article_pinning"
branch_labels = None
depends_on = None


DEFAULT_SITE_BIO = "平时主要写 Rust，做 RoboMaster 控制，也会管 Linux 服务器和交换机。缺什么工具，就自己补一个。"


def upgrade() -> None:
    op.create_table(
        "site_profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_site_profile_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    profile = sa.table(
        "site_profile",
        sa.column("id", sa.Integer()),
        sa.column("bio", sa.Text()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        profile,
        [{"id": 1, "bio": DEFAULT_SITE_BIO, "updated_at": datetime.now(timezone.utc)}],
    )


def downgrade() -> None:
    op.drop_table("site_profile")
