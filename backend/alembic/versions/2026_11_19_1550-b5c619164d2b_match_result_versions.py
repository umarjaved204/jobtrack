"""match result versions

Revision ID: b5c619164d2b
Revises: 3b8d5e0f1a62
Create Date: 2026-11-19 15:50:27.131907+00:00

The score's parts and the versions that make results comparable (ADR 0004,
services/match/scoring.py). NOT NULL without defaults: nothing has written match_results
before this revision. CHECK constraints are hand-written (autogenerate ignores them).
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b5c619164d2b"
down_revision: str | Sequence[str] | None = "3b8d5e0f1a62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("match_results", sa.Column("skill_coverage", sa.Double(), nullable=True))
    op.add_column("match_results", sa.Column("semantic_score", sa.Double(), nullable=False))
    op.add_column("match_results", sa.Column("scoring_version", sa.Integer(), nullable=False))
    op.add_column("match_results", sa.Column("calibration_version", sa.Integer(), nullable=False))
    op.add_column("match_results", sa.Column("taxonomy_version", sa.Integer(), nullable=False))
    op.create_check_constraint(
        op.f("ck_match_results_skill_coverage_range"),
        "match_results",
        "skill_coverage IS NULL OR (skill_coverage >= 0 AND skill_coverage <= 1)",
    )
    op.create_check_constraint(
        op.f("ck_match_results_semantic_range"),
        "match_results",
        "semantic_score >= 0 AND semantic_score <= 1",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("ck_match_results_semantic_range"), "match_results", type_="check")
    op.drop_constraint(
        op.f("ck_match_results_skill_coverage_range"), "match_results", type_="check"
    )
    op.drop_column("match_results", "taxonomy_version")
    op.drop_column("match_results", "calibration_version")
    op.drop_column("match_results", "scoring_version")
    op.drop_column("match_results", "semantic_score")
    op.drop_column("match_results", "skill_coverage")
