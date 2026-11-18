"""Calendar events (CRUD) and the merged calendar feed.

The feed range is half-open, [from, to), with both ends given as instants *with the
client's UTC offset* (e.g. a Chicago month view in March 2027 sends
from=2027-03-01T00:00:00-06:00 and to=2027-04-01T00:00:00-05:00; the offsets differ
because of daylight saving, and the client works them out).

- Timed items (events, timed reminders) are compared as instants. An event appears if it
  overlaps the range: it starts before `to` and either ends after `from` or starts at or
  after `from` (so a point-in-time event at exactly `from` is included, but one that ends
  exactly at midnight doesn't spill into the next day).
- Date-only items (apply-by dates, all-day reminders) are never converted through UTC.
  They're matched against the calendar days the range touches *in the client's zone*,
  read from the wall-clock dates of `from` and `to` as sent.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import FieldValidationError, NotFoundError, UnprocessableError
from app.models import Application, CalendarEvent, Reminder, User
from app.models.enums import ApplicationStatus
from app.schemas.application import ApplicationRef
from app.schemas.calendar import (
    ENDS_BEFORE_START,
    ApplyByItem,
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarFeed,
    CalendarItem,
    EventItem,
    ReminderItem,
)
from app.services.applications import get_application

NOT_FOUND = "Calendar event not found"
# Six weeks covers a month grid; a year leaves room for an agenda or export.
MAX_RANGE = timedelta(days=366)


def _ref(app_id: uuid.UUID | None, company: str | None, role_title: str | None) -> Any:
    if app_id is None or company is None or role_title is None:
        return None
    return ApplicationRef(id=app_id, company=company, role_title=role_title)


# --------------------------------------------------------------------------- events CRUD


def _events(user: User) -> Select[CalendarEvent, uuid.UUID | None, str | None, str | None]:
    return (
        select(CalendarEvent, Application.id, Application.company, Application.role_title)
        .outerjoin(Application, Application.id == CalendarEvent.application_id)
        .where(CalendarEvent.user_id == user.id)
    )


def _event_read(row: Any) -> CalendarEventRead:
    event, app_id, company, role_title = row
    return CalendarEventRead(
        id=event.id,
        kind=event.kind,
        title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        location_or_link=event.location_or_link,
        application=_ref(app_id, company, role_title),
    )


def list_events(
    db: Session, user: User, application_id: uuid.UUID | None = None
) -> list[CalendarEventRead]:
    stmt = _events(user).order_by(CalendarEvent.starts_at, CalendarEvent.id)
    if application_id is not None:
        stmt = stmt.where(CalendarEvent.application_id == application_id)
    return [_event_read(row) for row in db.execute(stmt)]


def get_event(db: Session, user: User, event_id: uuid.UUID) -> CalendarEventRead:
    row = db.execute(_events(user).where(CalendarEvent.id == event_id)).one_or_none()
    if row is None:
        raise NotFoundError(NOT_FOUND)
    return _event_read(row)


def _owned(db: Session, user: User, event_id: uuid.UUID) -> CalendarEvent:
    event = db.scalar(
        select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == user.id)
    )
    if event is None:
        raise NotFoundError(NOT_FOUND)
    return event


def create_event(db: Session, user: User, data: CalendarEventCreate) -> CalendarEventRead:
    if data.application_id is not None:
        get_application(db, user, data.application_id)  # 404 unless it's the user's own
    event = CalendarEvent(id=uuid.uuid4(), user_id=user.id, **data.model_dump())
    db.add(event)
    db.commit()
    return get_event(db, user, event.id)


def update_event(
    db: Session, user: User, event_id: uuid.UUID, data: CalendarEventUpdate
) -> CalendarEventRead:
    event = _owned(db, user, event_id)
    changes = data.model_dump(exclude_unset=True)

    # Validate the merged values before touching the row.
    starts_at = changes.get("starts_at", event.starts_at)
    ends_at = changes.get("ends_at", event.ends_at)
    if ends_at is not None and ends_at < starts_at:
        raise FieldValidationError("ends_at", ENDS_BEFORE_START)
    new_app = changes.get("application_id")
    if new_app is not None and new_app != event.application_id:
        get_application(db, user, new_app)

    for field, value in changes.items():
        setattr(event, field, value)

    db.commit()
    return get_event(db, user, event.id)


def delete_event(db: Session, user: User, event_id: uuid.UUID) -> None:
    db.delete(_owned(db, user, event_id))
    db.commit()


# --------------------------------------------------------------------------- merged feed


def _day_bounds(start: datetime, end: datetime) -> tuple[date, date]:
    """The client-local calendar days that [start, end) touches, inclusive. A day d is
    the local interval [d 00:00, d+1 00:00), so it overlaps when d >= start's date and
    d 00:00 < end, i.e. d <= the date of the last instant before `end`."""
    return start.date(), (end - timedelta(microseconds=1)).date()


def calendar_feed(
    db: Session, user: User, start: datetime, end: datetime, *, include_done: bool = False
) -> CalendarFeed:
    if end <= start:
        raise UnprocessableError("'to' must be after 'from'")
    if end - start > MAX_RANGE:
        raise UnprocessableError("The range can be at most 366 days")
    first_day, last_day = _day_bounds(start, end)

    events = db.execute(
        _events(user).where(
            CalendarEvent.starts_at < end,
            or_(
                func.coalesce(CalendarEvent.ends_at, CalendarEvent.starts_at) > start,
                CalendarEvent.starts_at >= start,
            ),
        )
    )
    items: list[CalendarItem] = [EventItem(**_event_read(row).model_dump()) for row in events]

    apply_by = db.scalars(
        select(Application).where(
            Application.user_id == user.id,
            Application.status == ApplicationStatus.WISHLIST,
            Application.deadline_on >= first_day,
            Application.deadline_on <= last_day,
        )
    )
    items += [
        ApplyByItem(
            id=app.id,
            title=f"Apply to {app.company}",
            date=app.deadline_on,
            application=ApplicationRef(id=app.id, company=app.company, role_title=app.role_title),
        )
        for app in apply_by
        if app.deadline_on is not None
    ]

    reminders = (
        select(Reminder, Application.id, Application.company, Application.role_title)
        .outerjoin(Application, Application.id == Reminder.application_id)
        .where(
            Reminder.user_id == user.id,
            or_(
                and_(Reminder.due_on >= first_day, Reminder.due_on <= last_day),
                and_(Reminder.due_at >= start, Reminder.due_at < end),
            ),
        )
    )
    if not include_done:
        reminders = reminders.where(Reminder.done_at.is_(None))
    items += [
        ReminderItem(
            id=reminder.id,
            title=reminder.title,
            date=reminder.due_on,
            starts_at=reminder.due_at,
            done_at=reminder.done_at,
            application=_ref(app_id, company, role_title),
        )
        for reminder, app_id, company, role_title in db.execute(reminders)
    ]

    items.sort(key=lambda item: _sort_key(item, start))
    return CalendarFeed(items=items)


def _sort_key(item: CalendarItem, start: datetime) -> tuple[date, int, datetime | None, str]:
    """Day (in the client's offset at `from`), then all-day items before timed ones, then
    time. Approximate across a DST change; clients re-sort in local time anyway."""
    moment = getattr(item, "starts_at", None)
    if moment is None:
        day = item.date if not isinstance(item, EventItem) and item.date else start.date()
        return day, 0, None, item.title
    local = moment.astimezone(start.tzinfo)
    return local.date(), 1, local, item.title
