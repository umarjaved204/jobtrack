import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ResumeVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One version of a resume, as pasted text. Once a version has been sent with an
    application (or matched against a job description) its text is frozen and it can only
    be archived, not deleted: see services/resumes.py."""

    __tablename__ = "resume_versions"
    __table_args__ = (
        # At most one default resume per user.
        Index(
            "uq_resume_versions_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where="is_default",
        ),
        CheckConstraint("archived_at IS NULL OR NOT is_default", name="archived_not_default"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(100))
    content_text: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Hidden from pickers, kept for history (applications that used it still show it).
    archived_at: Mapped[datetime | None]
