"""Enumerations shared by models and API schemas.

Stored as VARCHAR + CHECK constraint (not native Postgres ENUM types): adding a value
later is a simple constraint swap in a migration instead of `ALTER TYPE` gymnastics.
"""

from enum import StrEnum

from sqlalchemy import Enum


class ApplicationStatus(StrEnum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class WorkMode(StrEnum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"


class EventType(StrEnum):
    STATUS_CHANGE = "status_change"
    NOTE = "note"


class CalendarEventKind(StrEnum):
    INTERVIEW = "interview"
    ASSESSMENT = "assessment"
    DEADLINE = "deadline"
    OTHER = "other"


class ThemePreference(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


def str_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    """SQLAlchemy column type: stores the enum *values* in a VARCHAR with a CHECK constraint."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [m.value for m in members],
        validate_strings=True,
    )
