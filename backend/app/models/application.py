import uuid
from datetime import date

from sqlalchemy import (
    CheckConstraint,
    Column,
    Double,
    ForeignKey,
    Index,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ApplicationStatus, EventType, WorkMode, str_enum


class Application(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        # Kanban: fetch a user's column ordered by position.
        Index("ix_applications_user_status_position", "user_id", "status", "position"),
        # Dashboard time series and date-range filters.
        Index("ix_applications_user_applied_on", "user_id", "applied_on"),
        # Fuzzy search (?q=) on company and role via pg_trgm.
        Index(
            "ix_applications_company_trgm",
            "company",
            postgresql_using="gin",
            postgresql_ops={"company": "gin_trgm_ops"},
        ),
        Index(
            "ix_applications_role_title_trgm",
            "role_title",
            postgresql_using="gin",
            postgresql_ops={"role_title": "gin_trgm_ops"},
        ),
        CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
            name="salary_range",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    company: Mapped[str] = mapped_column(String(200))
    role_title: Mapped[str] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(200))
    work_mode: Mapped[WorkMode | None] = mapped_column(str_enum(WorkMode, "work_mode"))
    job_url: Mapped[str | None] = mapped_column(String(2048))
    salary_min: Mapped[int | None]
    salary_max: Mapped[int | None]
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    source: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[ApplicationStatus] = mapped_column(
        str_enum(ApplicationStatus, "application_status"),
        default=ApplicationStatus.WISHLIST,
        server_default=ApplicationStatus.WISHLIST.value,
    )
    # Float ordering within a kanban column: insert between neighbours at the midpoint.
    position: Mapped[float] = mapped_column(Double, default=0.0, server_default="0")
    applied_on: Mapped[date | None]
    deadline_on: Mapped[date | None]
    resume_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resume_versions.id", ondelete="SET NULL")
    )


class ApplicationEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Timeline entry: either a status change or a free-text note."""

    __tablename__ = "application_events"
    __table_args__ = (
        Index("ix_application_events_application_created", "application_id", "created_at"),
        CheckConstraint(
            "(type = 'note' AND body IS NOT NULL)"
            " OR (type = 'status_change' AND to_status IS NOT NULL)",
            name="payload_matches_type",
        ),
    )

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE")
    )
    type: Mapped[EventType] = mapped_column(str_enum(EventType, "event_type"))
    from_status: Mapped[ApplicationStatus | None] = mapped_column(
        str_enum(ApplicationStatus, "from_status")
    )
    to_status: Mapped[ApplicationStatus | None] = mapped_column(
        str_enum(ApplicationStatus, "to_status")
    )
    body: Mapped[str | None] = mapped_column(Text)


class Contact(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "contacts"

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    linkedin_url: Mapped[str | None] = mapped_column(String(2048))
    notes: Mapped[str | None] = mapped_column(Text)


class Tag(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(40))
    color: Mapped[str] = mapped_column(String(20))


application_tags = Table(
    "application_tags",
    Base.metadata,
    Column(
        "application_id",
        ForeignKey("applications.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True),
)
