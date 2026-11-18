import uuid
from datetime import date
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.application import ApplicationRef, Text200
from app.schemas.common import UtcDatetime


class ReminderStatus(StrEnum):
    OPEN = "open"
    DONE = "done"
    ALL = "all"


class ReminderCreate(BaseModel):
    """Send `due_on` (a date) for an all-day reminder, or `due_at` (an instant with an
    offset) for a timed one: exactly one."""

    model_config = ConfigDict(extra="forbid")

    title: Text200
    application_id: uuid.UUID | None = None
    due_on: date | None = None
    due_at: UtcDatetime | None = None

    @model_validator(mode="after")
    def _exactly_one_due(self) -> Self:
        if (self.due_on is None) == (self.due_at is None):
            raise ValueError("Send exactly one of due_on (all day) or due_at (timed)")
        return self


class ReminderUpdate(BaseModel):
    """PATCH: only sent fields change. Sending `due_on` makes the reminder all-day and
    sending `due_at` makes it timed (the other one is cleared). `done` marks it done or
    reopens it; the server records when."""

    model_config = ConfigDict(extra="forbid")

    title: Text200 | None = None
    application_id: uuid.UUID | None = None
    due_on: date | None = None
    due_at: UtcDatetime | None = None
    done: bool | None = None

    @model_validator(mode="after")
    def _valid(self) -> Self:
        for name in ("title", "due_on", "due_at", "done"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        if self.due_on is not None and self.due_at is not None:
            raise ValueError("Send due_on (all day) or due_at (timed), not both")
        return self


class ReminderRead(BaseModel):
    id: uuid.UUID
    title: str
    application: ApplicationRef | None
    due_on: date | None
    due_at: UtcDatetime | None
    done_at: UtcDatetime | None
