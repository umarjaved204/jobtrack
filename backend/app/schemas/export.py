"""The shape of GET /export. JSON nests contacts and the timeline under each application;
the CSV download flattens the same models into one file per table (services/export.py).

`format_version` changes when a field is renamed or removed (adding one doesn't), so a
script reading old exports can tell them apart.
"""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.enums import (
    ApplicationStatus,
    CalendarEventKind,
    EventType,
    ThemePreference,
    WorkMode,
)
from app.schemas.common import UtcDatetime

FORMAT_VERSION = 1


class _FromOrm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ExportUser(_FromOrm):
    email: str
    full_name: str
    theme: ThemePreference
    accent: str
    created_at: UtcDatetime


class ExportTag(_FromOrm):
    id: uuid.UUID
    name: str
    color: str


class ExportContact(_FromOrm):
    id: uuid.UUID
    application_id: uuid.UUID
    name: str
    role: str | None
    email: str | None
    phone: str | None
    linkedin_url: str | None
    notes: str | None


class ExportTimelineEntry(_FromOrm):
    """A status change or a note."""

    id: uuid.UUID
    application_id: uuid.UUID
    type: EventType
    from_status: ApplicationStatus | None
    to_status: ApplicationStatus | None
    body: str | None
    created_at: UtcDatetime


class ExportApplication(BaseModel):
    """No kanban `position`: it's an ordering detail, not data."""

    id: uuid.UUID
    company: str
    role_title: str
    status: ApplicationStatus
    location: str | None
    work_mode: WorkMode | None
    job_url: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    applied_on: date | None
    deadline_on: date | None
    resume_version_id: uuid.UUID | None
    tags: list[str]
    created_at: UtcDatetime
    updated_at: UtcDatetime
    contacts: list[ExportContact]
    timeline: list[ExportTimelineEntry]


class ExportResumeVersion(_FromOrm):
    id: uuid.UUID
    label: str
    is_default: bool
    archived_at: UtcDatetime | None
    content_text: str
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ExportReminder(_FromOrm):
    """Exactly one of `due_on` (all-day) and `due_at` (timed) is set."""

    id: uuid.UUID
    application_id: uuid.UUID | None
    title: str
    due_on: date | None
    due_at: UtcDatetime | None
    done_at: UtcDatetime | None


class ExportCalendarEvent(_FromOrm):
    id: uuid.UUID
    application_id: uuid.UUID | None
    kind: CalendarEventKind
    title: str
    starts_at: UtcDatetime
    ends_at: UtcDatetime | None
    location_or_link: str | None


class ExportDocument(BaseModel):
    format_version: int = FORMAT_VERSION
    exported_at: UtcDatetime
    user: ExportUser
    applications: list[ExportApplication]
    tags: list[ExportTag]
    resume_versions: list[ExportResumeVersion]
    reminders: list[ExportReminder]
    calendar_events: list[ExportCalendarEvent]
