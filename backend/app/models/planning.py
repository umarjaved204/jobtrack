"""Time-based models: follow-up reminders and calendar events (interviews, deadlines)."""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import CalendarEventKind, str_enum


class Reminder(UUIDPrimaryKeyMixin, Base):
    """A follow-up, shown in the app only (no email or push).

    Exactly one of `due_on` / `due_at` is set:
    - all-day: `due_on` is a plain date, never converted through UTC, so it stays on the
      same calendar day wherever the user is;
    - timed: `due_at` is an instant (timestamptz, UTC), shown in the browser's zone.
    """

    __tablename__ = "reminders"
    __table_args__ = (
        CheckConstraint("(due_on IS NULL) <> (due_at IS NULL)", name="one_due"),
        # Lists and "Coming up" only ever look at open reminders.
        Index(
            "ix_reminders_user_due_open",
            "user_id",
            "due_on",
            "due_at",
            postgresql_where=text("done_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    due_on: Mapped[date | None]
    due_at: Mapped[datetime | None]
    done_at: Mapped[datetime | None]


class CalendarEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "calendar_events"
    __table_args__ = (
        # GET /calendar?from&to range scans.
        Index("ix_calendar_events_user_starts_at", "user_id", "starts_at"),
        CheckConstraint("ends_at IS NULL OR ends_at >= starts_at", name="ends_after_start"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[CalendarEventKind] = mapped_column(str_enum(CalendarEventKind, "kind"))
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime | None]
    location_or_link: Mapped[str | None] = mapped_column(String(2048))
