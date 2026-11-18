"""Follow-up reminders (in-app only: nothing is emailed or pushed).

All-day reminders carry a date (`due_on`), timed ones an instant (`due_at`); "overdue" is
decided in the browser, which knows the user's local date and time. The server orders by
due day so lists arrive roughly sorted, but a timed reminder's day is its UTC day here:
clients re-sort in local time.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Date, Select, cast, func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Application, Reminder, User
from app.schemas.application import ApplicationRef
from app.schemas.reminder import ReminderCreate, ReminderRead, ReminderStatus, ReminderUpdate
from app.services.applications import get_application

NOT_FOUND = "Reminder not found"


def _with_application(user: User) -> Select[Reminder, uuid.UUID | None, str | None, str | None]:
    return (
        select(Reminder, Application.id, Application.company, Application.role_title)
        .outerjoin(Application, Application.id == Reminder.application_id)
        .where(Reminder.user_id == user.id)
    )


def _read(row: Any) -> ReminderRead:
    reminder, app_id, company, role_title = row
    return ReminderRead(
        id=reminder.id,
        title=reminder.title,
        application=(
            ApplicationRef(id=app_id, company=company, role_title=role_title)
            if app_id is not None
            else None
        ),
        due_on=reminder.due_on,
        due_at=reminder.due_at,
        done_at=reminder.done_at,
    )


def _due_day() -> Any:
    return func.coalesce(Reminder.due_on, cast(func.timezone("UTC", Reminder.due_at), Date))


def list_reminders(
    db: Session,
    user: User,
    status: ReminderStatus = ReminderStatus.OPEN,
    application_id: uuid.UUID | None = None,
) -> list[ReminderRead]:
    """Open reminders by due day (all-day before timed on the same day); done ones most
    recently completed first; `all` = open first, then done."""
    stmt = _with_application(user)
    if application_id is not None:
        stmt = stmt.where(Reminder.application_id == application_id)
    if status == ReminderStatus.OPEN:
        stmt = stmt.where(Reminder.done_at.is_(None))
    elif status == ReminderStatus.DONE:
        stmt = stmt.where(Reminder.done_at.is_not(None))
    stmt = stmt.order_by(
        Reminder.done_at.is_not(None),
        Reminder.done_at.desc(),
        _due_day(),
        Reminder.due_at.asc().nulls_first(),
        Reminder.id,
    )
    return [_read(row) for row in db.execute(stmt)]


def get_reminder(db: Session, user: User, reminder_id: uuid.UUID) -> ReminderRead:
    row = db.execute(_with_application(user).where(Reminder.id == reminder_id)).one_or_none()
    if row is None:
        raise NotFoundError(NOT_FOUND)
    return _read(row)


def _owned(db: Session, user: User, reminder_id: uuid.UUID) -> Reminder:
    reminder = db.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    if reminder is None:
        raise NotFoundError(NOT_FOUND)
    return reminder


def create_reminder(db: Session, user: User, data: ReminderCreate) -> ReminderRead:
    if data.application_id is not None:
        get_application(db, user, data.application_id)  # 404 unless it's the user's own
    reminder = Reminder(
        id=uuid.uuid4(),
        user_id=user.id,
        application_id=data.application_id,
        title=data.title,
        due_on=data.due_on,
        due_at=data.due_at,
    )
    db.add(reminder)
    db.commit()
    return get_reminder(db, user, reminder.id)


def update_reminder(
    db: Session, user: User, reminder_id: uuid.UUID, data: ReminderUpdate
) -> ReminderRead:
    reminder = _owned(db, user, reminder_id)
    sent = data.model_fields_set

    if data.title is not None:
        reminder.title = data.title
    if "application_id" in sent:
        if data.application_id is not None and data.application_id != reminder.application_id:
            get_application(db, user, data.application_id)
        reminder.application_id = data.application_id
    if data.due_on is not None:  # becomes (or stays) all-day
        reminder.due_on, reminder.due_at = data.due_on, None
    if data.due_at is not None:  # becomes (or stays) timed
        reminder.due_on, reminder.due_at = None, data.due_at
    if data.done is True:
        reminder.done_at = reminder.done_at or datetime.now(UTC)
    elif data.done is False:
        reminder.done_at = None

    db.commit()
    return get_reminder(db, user, reminder.id)


def delete_reminder(db: Session, user: User, reminder_id: uuid.UUID) -> None:
    db.delete(_owned(db, user, reminder_id))
    db.commit()
