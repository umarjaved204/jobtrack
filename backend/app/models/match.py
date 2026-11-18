import uuid

from sqlalchemy import CheckConstraint, Double, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class MatchResult(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A saved resume-vs-job-description analysis (Phase 9)."""

    __tablename__ = "match_results"
    __table_args__ = (
        Index("ix_match_results_user_created", "user_id", "created_at"),
        CheckConstraint("score >= 0 AND score <= 100", name="score_range"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # NO ACTION (not CASCADE): deleting a resume must never silently delete match history;
    # the service only deletes unused resumes. Not RESTRICT either: RESTRICT is checked per
    # row mid-cascade, so deleting a user (which cascades to both tables) could fail.
    resume_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resume_versions.id"), index=True
    )
    # Keep the analysis if the application is deleted.
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL"), index=True
    )
    jd_text: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Double)
    matched_skills: Mapped[list[str]] = mapped_column(JSONB)
    missing_skills: Mapped[list[str]] = mapped_column(JSONB)
    suggested_keywords: Mapped[list[str]] = mapped_column(JSONB)
    model_name: Mapped[str] = mapped_column(String(100))
