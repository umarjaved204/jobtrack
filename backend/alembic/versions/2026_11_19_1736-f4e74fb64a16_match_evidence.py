"""match evidence

Revision ID: f4e74fb64a16
Revises: b5c619164d2b
Create Date: 2026-11-19 17:36:28.336874+00:00

The explanation shown with a result. NOT NULL without defaults: nothing writes
match_results before the match API, which lands with this revision.

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f4e74fb64a16"
down_revision: str | Sequence[str] | None = "b5c619164d2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "match_results",
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.add_column("match_results", sa.Column("sections_detected", sa.Boolean(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("match_results", "sections_detected")
    op.drop_column("match_results", "evidence")
