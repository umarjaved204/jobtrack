import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import AwareDatetime

from app.api.deps import CurrentUser, DbSession
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarFeed,
)
from app.services import calendar as service

router = APIRouter(tags=["calendar"])


@router.get("/calendar", response_model=CalendarFeed)
def calendar_feed(
    user: CurrentUser,
    db: DbSession,
    start: Annotated[
        AwareDatetime,
        Query(alias="from", description="Range start (inclusive), with the client's offset"),
    ],
    end: Annotated[
        AwareDatetime,
        Query(alias="to", description="Range end (exclusive), with the client's offset"),
    ],
    include_done: Annotated[bool, Query(description="Also list done reminders")] = False,
) -> CalendarFeed:
    """Events, wishlist apply-by dates and reminders in [from, to). See services/calendar.py
    for how timed and date-only items are matched."""
    return service.calendar_feed(db, user, start, end, include_done=include_done)


@router.get("/calendar-events", response_model=list[CalendarEventRead])
def list_events(
    user: CurrentUser, db: DbSession, application_id: uuid.UUID | None = None
) -> list[CalendarEventRead]:
    return service.list_events(db, user, application_id)


@router.post(
    "/calendar-events", status_code=status.HTTP_201_CREATED, response_model=CalendarEventRead
)
def create_event(data: CalendarEventCreate, user: CurrentUser, db: DbSession) -> CalendarEventRead:
    return service.create_event(db, user, data)


@router.patch("/calendar-events/{event_id}", response_model=CalendarEventRead)
def update_event(
    event_id: uuid.UUID, data: CalendarEventUpdate, user: CurrentUser, db: DbSession
) -> CalendarEventRead:
    return service.update_event(db, user, event_id, data)


@router.delete("/calendar-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_event(db, user, event_id)
