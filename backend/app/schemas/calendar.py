import uuid
from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.enums import CalendarEventKind
from app.schemas.application import ApplicationRef, Text200
from app.schemas.common import UtcDatetime

# Free text: a room, an address or a video-call link. The client renders it as a link
# only when it's an http(s) URL.
LocationOrLink = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2048)
]

ENDS_BEFORE_START = "The end must not be before the start"


class CalendarEventCreate(BaseModel):
    """`kind`: interview, assessment (take-home or test), deadline (a dated obligation
    other than applying: replying to an offer, sending documents; the "apply by" date
    lives on the application), or other."""

    model_config = ConfigDict(extra="forbid")

    kind: CalendarEventKind
    title: Text200
    starts_at: UtcDatetime
    ends_at: UtcDatetime | None = None
    location_or_link: LocationOrLink | None = None
    application_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _ends_after_start(self) -> Self:
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError(ENDS_BEFORE_START)
        return self


class CalendarEventUpdate(BaseModel):
    """PATCH: only sent fields change; null clears an optional field. The start/end order
    is re-checked in the service against the merged values."""

    model_config = ConfigDict(extra="forbid")

    kind: CalendarEventKind | None = None
    title: Text200 | None = None
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    location_or_link: LocationOrLink | None = None
    application_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _required_fields_not_cleared(self) -> Self:
        for name in ("kind", "title", "starts_at"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class CalendarEventRead(BaseModel):
    id: uuid.UUID
    kind: CalendarEventKind
    title: str
    starts_at: UtcDatetime
    ends_at: UtcDatetime | None
    location_or_link: str | None
    application: ApplicationRef | None


# --------------------------------------------------------------------------- merged feed
# GET /calendar: one list of everything dated. Date-only items carry `date` (never
# converted through UTC); timed items carry `starts_at` (and events an optional `ends_at`).
# Every item that belongs to an application carries it, which is also its link target.


class EventItem(BaseModel):
    type: Literal["event"] = "event"
    id: uuid.UUID
    title: str
    kind: CalendarEventKind
    starts_at: UtcDatetime
    ends_at: UtcDatetime | None
    location_or_link: str | None
    application: ApplicationRef | None


class ApplyByItem(BaseModel):
    """A wishlist application's "apply by" date. `id` is the application's id."""

    type: Literal["apply_by"] = "apply_by"
    id: uuid.UUID
    title: str
    date: date
    application: ApplicationRef


class ReminderItem(BaseModel):
    """An open reminder: all-day ones carry `date`, timed ones `starts_at`."""

    type: Literal["reminder"] = "reminder"
    id: uuid.UUID
    title: str
    date: date | None
    starts_at: UtcDatetime | None
    done_at: UtcDatetime | None
    application: ApplicationRef | None


CalendarItem = Annotated[EventItem | ApplyByItem | ReminderItem, Field(discriminator="type")]


class CalendarFeed(BaseModel):
    items: list[CalendarItem]
