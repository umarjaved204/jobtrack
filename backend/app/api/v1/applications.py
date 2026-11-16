import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.models import Application, ApplicationEvent
from app.models.enums import ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationFilters,
    ApplicationRead,
    ApplicationSort,
    ApplicationUpdate,
    Board,
    BoardColumn,
    EventRead,
    MoveRequest,
    NoteCreate,
)
from app.schemas.common import Page
from app.services import applications as service

router = APIRouter(prefix="/applications", tags=["applications"])

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "Application not found (or owned by another user)"}
}


@router.get("")
def list_applications(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[
        str | None, Query(max_length=100, description="Search company and role title")
    ] = None,
    status_: Annotated[
        list[ApplicationStatus] | None,
        Query(alias="status", description="Repeat for several: ?status=applied&status=offer"),
    ] = None,
    source: Annotated[list[str] | None, Query(description="Repeatable, case-insensitive")] = None,
    tag: Annotated[list[uuid.UUID] | None, Query(description="Tag ids; matches any")] = None,
    applied_from: Annotated[date | None, Query(alias="from", description="applied_on >=")] = None,
    applied_to: Annotated[date | None, Query(alias="to", description="applied_on <=")] = None,
    sort: ApplicationSort = ApplicationSort.CREATED_AT_DESC,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ApplicationRead]:
    filters = ApplicationFilters(
        q=q,
        statuses=status_ or [],
        sources=source or [],
        tag_ids=tag or [],
        applied_from=applied_from,
        applied_to=applied_to,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    items, total = service.list_applications(db, user, filters)
    return Page[ApplicationRead](
        items=[ApplicationRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=service.page_count(total, page_size),
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ApplicationRead)
def create_application(data: ApplicationCreate, user: CurrentUser, db: DbSession) -> Application:
    return service.create_application(db, user, data)


# Declared before /{application_id}, otherwise "board" would be parsed as an id (422).
@router.get("/board")
def get_board(user: CurrentUser, db: DbSession) -> Board:
    """All applications grouped into the 7 status columns, each ordered by position."""
    board = service.get_board(db, user)
    return Board(
        columns=[
            BoardColumn(
                status=column_status,
                applications=[ApplicationRead.model_validate(a) for a in applications],
            )
            for column_status, applications in board.items()
        ]
    )


@router.get("/{application_id}", response_model=ApplicationRead, responses=_NOT_FOUND)
def get_application(application_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Application:
    return service.get_application(db, user, application_id)


@router.patch("/{application_id}", response_model=ApplicationRead, responses=_NOT_FOUND)
def update_application(
    application_id: uuid.UUID, data: ApplicationUpdate, user: CurrentUser, db: DbSession
) -> Application:
    return service.update_application(db, user, application_id, data)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND)
def delete_application(application_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_application(db, user, application_id)


@router.post("/{application_id}/move", response_model=ApplicationRead, responses=_NOT_FOUND)
def move_application(
    application_id: uuid.UUID, move: MoveRequest, user: CurrentUser, db: DbSession
) -> Application:
    """Drop a card into a column at a position. Logs a status_change event if the column
    changed. If positions in the column get too close, the column is re-spaced, so
    refetch the board afterwards rather than trusting local positions."""
    return service.move_application(db, user, application_id, move)


@router.get("/{application_id}/events", response_model=list[EventRead], responses=_NOT_FOUND)
def list_events(
    application_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[ApplicationEvent]:
    """Timeline (status changes and notes), newest first."""
    return service.list_events(db, user, application_id)


@router.post(
    "/{application_id}/events",
    status_code=status.HTTP_201_CREATED,
    response_model=EventRead,
    responses=_NOT_FOUND,
)
def add_note(
    application_id: uuid.UUID, note: NoteCreate, user: CurrentUser, db: DbSession
) -> ApplicationEvent:
    """Add a note to the timeline. Status changes are logged automatically, not posted."""
    return service.add_note(db, user, application_id, note.body)
