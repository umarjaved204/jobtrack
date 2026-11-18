"""resume archiving

Revision ID: 7c2a91d4e5b3
Revises: f4858f390353
Create Date: 2026-11-18 10:00:00+00:00

Hand-written: autogenerate doesn't compare CHECK constraints.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7c2a91d4e5b3"
down_revision: str | Sequence[str] | None = "f4858f390353"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MATCH_FK = op.f("fk_match_results_resume_version_id_resume_versions")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "resume_versions", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_check_constraint(
        op.f("ck_resume_versions_archived_not_default"),
        "resume_versions", "archived_at IS NULL OR NOT is_default"
    )
    # Match history must survive: a used resume is archived, never deleted.
    op.drop_constraint(MATCH_FK, "match_results", type_="foreignkey")
    op.create_foreign_key(
        MATCH_FK, "match_results", "resume_versions", ["resume_version_id"], ["id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(MATCH_FK, "match_results", type_="foreignkey")
    op.create_foreign_key(
        MATCH_FK,
        "match_results",
        "resume_versions",
        ["resume_version_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(op.f("ck_resume_versions_archived_not_default"), "resume_versions", type_="check")
    op.drop_column("resume_versions", "archived_at")
