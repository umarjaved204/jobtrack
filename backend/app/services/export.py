"""GET /export: everything a user has entered, as one JSON document or a zip of CSVs.

Covered: the profile, applications (with tags, contacts and the timeline), tags, resume
versions (full text), reminders and calendar events. Not covered: match results (derived
from a resume and an advert; deleted from Settings) and refresh tokens (credentials).

CSV: one file per table, linked by ids. Written UTF-8 with a BOM so Excel reads accents
and typographic quotes correctly. Text cells that a spreadsheet would run as a formula
(starting with = + - @, a tab or a carriage return) get a leading apostrophe (OWASP's CSV
injection advice); the JSON is left exactly as stored.
"""

import csv
import io
import uuid
import zipfile
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationEvent,
    CalendarEvent,
    Contact,
    Reminder,
    ResumeVersion,
    Tag,
    User,
)
from app.schemas.export import (
    ExportApplication,
    ExportCalendarEvent,
    ExportContact,
    ExportDocument,
    ExportReminder,
    ExportResumeVersion,
    ExportTag,
    ExportTimelineEntry,
    ExportUser,
)

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def build_export(db: Session, user: User, now: datetime | None = None) -> ExportDocument:
    """Every query is scoped to `user`: contacts and the timeline through their application."""
    applications = db.scalars(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.created_at, Application.id)
    ).all()

    contacts: dict[uuid.UUID, list[ExportContact]] = defaultdict(list)
    for contact in db.scalars(
        select(Contact)
        .join(Application, Contact.application_id == Application.id)
        .where(Application.user_id == user.id)
        .order_by(Contact.name, Contact.id)
    ):
        contacts[contact.application_id].append(ExportContact.model_validate(contact))

    timeline: dict[uuid.UUID, list[ExportTimelineEntry]] = defaultdict(list)
    for event in db.scalars(
        select(ApplicationEvent)
        .join(Application, ApplicationEvent.application_id == Application.id)
        .where(Application.user_id == user.id)
        .order_by(ApplicationEvent.created_at, ApplicationEvent.id)
    ):
        timeline[event.application_id].append(ExportTimelineEntry.model_validate(event))

    return ExportDocument(
        exported_at=now or datetime.now(UTC),
        user=ExportUser.model_validate(user),
        applications=[
            ExportApplication(
                id=app.id,
                company=app.company,
                role_title=app.role_title,
                status=app.status,
                location=app.location,
                work_mode=app.work_mode,
                job_url=app.job_url,
                salary_min=app.salary_min,
                salary_max=app.salary_max,
                salary_currency=app.salary_currency,
                source=app.source,
                applied_on=app.applied_on,
                deadline_on=app.deadline_on,
                resume_version_id=app.resume_version_id,
                tags=[tag.name for tag in app.tags],
                created_at=app.created_at,
                updated_at=app.updated_at,
                contacts=contacts[app.id],
                timeline=timeline[app.id],
            )
            for app in applications
        ],
        tags=_all(db, Tag, user, ExportTag, Tag.name),
        resume_versions=_all(
            db, ResumeVersion, user, ExportResumeVersion, ResumeVersion.created_at
        ),
        reminders=_all(db, Reminder, user, ExportReminder, Reminder.id),
        calendar_events=_all(db, CalendarEvent, user, ExportCalendarEvent, CalendarEvent.starts_at),
    )


def _all[S: BaseModel](db: Session, model: Any, user: User, schema: type[S], order: Any) -> list[S]:
    rows = db.scalars(select(model).where(model.user_id == user.id).order_by(order, model.id))
    return [schema.model_validate(row) for row in rows]


def to_json(document: ExportDocument) -> bytes:
    return document.model_dump_json(indent=2).encode()


def to_csv_zip(document: ExportDocument) -> bytes:
    applications = [
        app.model_dump(mode="json", exclude={"contacts", "timeline"})
        | {"tags": "; ".join(app.tags)}
        for app in document.applications
    ]
    tables: dict[str, tuple[type[BaseModel], Sequence[dict[str, Any]]]] = {
        "applications.csv": (ExportApplication, applications),
        "contacts.csv": (
            ExportContact,
            _dump(c for a in document.applications for c in a.contacts),
        ),
        "timeline.csv": (
            ExportTimelineEntry,
            _dump(e for a in document.applications for e in a.timeline),
        ),
        "tags.csv": (ExportTag, _dump(document.tags)),
        "resume_versions.csv": (ExportResumeVersion, _dump(document.resume_versions)),
        "reminders.csv": (ExportReminder, _dump(document.reminders)),
        "calendar_events.csv": (ExportCalendarEvent, _dump(document.calendar_events)),
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, (schema, rows) in tables.items():
            columns = [f for f in schema.model_fields if f not in {"contacts", "timeline"}]
            archive.writestr(name, _csv(columns, rows))
    return buffer.getvalue()


def _dump(items: Iterable[BaseModel]) -> list[dict[str, Any]]:
    return [item.model_dump(mode="json") for item in items]


def _csv(columns: list[str], rows: Sequence[dict[str, Any]]) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_cell(row[column]) for column in columns])
    return out.getvalue().encode("utf-8-sig")


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value
