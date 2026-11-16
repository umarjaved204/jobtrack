"""Importing this package registers every model on `Base.metadata` (needed by Alembic)."""

from app.models.application import Application, ApplicationEvent, Contact, Tag, application_tags
from app.models.match import MatchResult
from app.models.planning import CalendarEvent, Reminder
from app.models.resume import ResumeVersion
from app.models.user import RefreshToken, User

__all__ = [
    "Application",
    "ApplicationEvent",
    "CalendarEvent",
    "Contact",
    "MatchResult",
    "RefreshToken",
    "Reminder",
    "ResumeVersion",
    "Tag",
    "User",
    "application_tags",
]
