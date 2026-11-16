import uuid

from sqlalchemy import ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ResumeVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "resume_versions"
    __table_args__ = (
        # At most one default resume per user.
        Index(
            "uq_resume_versions_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where="is_default",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(100))
    content_text: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(default=False, server_default=false())
