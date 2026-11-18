import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.reminder import ReminderCreate, ReminderRead, ReminderStatus, ReminderUpdate
from app.services import reminders as service

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=list[ReminderRead])
def list_reminders(
    user: CurrentUser,
    db: DbSession,
    reminder_status: Annotated[ReminderStatus, Query(alias="status")] = ReminderStatus.OPEN,
    application_id: uuid.UUID | None = None,
) -> list[ReminderRead]:
    return service.list_reminders(db, user, reminder_status, application_id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ReminderRead)
def create_reminder(data: ReminderCreate, user: CurrentUser, db: DbSession) -> ReminderRead:
    return service.create_reminder(db, user, data)


@router.patch("/{reminder_id}", response_model=ReminderRead)
def update_reminder(
    reminder_id: uuid.UUID, data: ReminderUpdate, user: CurrentUser, db: DbSession
) -> ReminderRead:
    return service.update_reminder(db, user, reminder_id, data)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_reminder(db, user, reminder_id)
