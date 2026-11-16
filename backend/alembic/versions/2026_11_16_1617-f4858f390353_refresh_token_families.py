"""refresh token families

Revision ID: f4858f390353
Revises: 1e1e0ffd7f03
Create Date: 2026-11-16 16:17:54.833404+00:00

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4858f390353"
down_revision: str | Sequence[str] | None = "1e1e0ffd7f03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Three steps because the table may already hold tokens: add the column as nullable,
    # give every existing token its own family (its id), then enforce NOT NULL.
    op.add_column("refresh_tokens", sa.Column("family_id", sa.Uuid(), nullable=True))
    op.execute("UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.create_index(
        op.f("ix_refresh_tokens_family_id"), "refresh_tokens", ["family_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
