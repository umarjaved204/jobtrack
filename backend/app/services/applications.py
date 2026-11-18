"""Applications: CRUD, kanban moves, board, search/filter/pagination, timeline events.

Every query is scoped to the current user. Another user's application is reported as
"not found" (404), never "forbidden", so ids can't be probed for existence.
"""

import math
import uuid
from datetime import UTC, date, datetime
from itertools import pairwise
from typing import Any

from sqlalchemy import ColumnElement, Select, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, UnprocessableError
from app.models import Application, ApplicationEvent, ResumeVersion, Tag, User, application_tags
from app.models.enums import ApplicationStatus, EventType
from app.schemas.application import (
    ApplicationCreate,
    ApplicationFilters,
    ApplicationSort,
    ApplicationUpdate,
    MoveRequest,
)

# Kanban ordering: positions are floats spaced POSITION_STEP apart. Drops land on the
# midpoint between neighbours; once two neighbours get closer than MIN_POSITION_GAP
# (float precision runs out after ~40 halvings), the column is re-spaced.
POSITION_STEP = 1024.0
MIN_POSITION_GAP = 1e-6

NOT_FOUND = "Application not found"


def _now() -> datetime:
    return datetime.now(UTC)


def _today() -> date:
    return _now().date()


# --------------------------------------------------------------------------- lookups


def get_application(db: Session, user: User, application_id: uuid.UUID) -> Application:
    application = db.scalar(
        select(Application).where(Application.id == application_id, Application.user_id == user.id)
    )
    if application is None:
        raise NotFoundError(NOT_FOUND)
    return application


def _resolve_tags(db: Session, user: User, tag_ids: list[uuid.UUID]) -> list[Tag]:
    wanted = set(tag_ids)
    if not wanted:
        return []
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(wanted), Tag.user_id == user.id)))
    if len(tags) != len(wanted):
        raise UnprocessableError("One or more tags do not exist")
    return tags


def _check_resume_version(db: Session, user: User, resume_version_id: uuid.UUID) -> None:
    """A newly linked resume must be the user's own and not archived. An application that
    already points at a since-archived version keeps it (callers skip unchanged values)."""
    row = db.execute(
        select(ResumeVersion.archived_at).where(
            ResumeVersion.id == resume_version_id, ResumeVersion.user_id == user.id
        )
    ).one_or_none()
    if row is None:
        raise UnprocessableError("Resume version does not exist")
    if row.archived_at is not None:
        raise UnprocessableError("Resume version is archived")


def _end_of_column(db: Session, user: User, status: ApplicationStatus) -> float:
    last = db.scalar(
        select(func.max(Application.position)).where(
            Application.user_id == user.id, Application.status == status
        )
    )
    return (last or 0.0) + POSITION_STEP


# --------------------------------------------------------------------------- status + events


def _log_status_change(
    db: Session,
    application: Application,
    from_status: ApplicationStatus | None,
    to_status: ApplicationStatus,
) -> None:
    db.add(
        ApplicationEvent(
            application_id=application.id,
            type=EventType.STATUS_CHANGE,
            from_status=from_status,
            to_status=to_status,
            # Set explicitly (not the DB default): now() is the transaction start time,
            # so events created in one transaction would otherwise share a timestamp.
            created_at=_now(),
        )
    )


def _fill_applied_on(application: Application) -> None:
    """Leaving the wishlist means it was applied for; default the date to today so the
    dashboard's time series isn't missing it. An explicit date is never overwritten."""
    if application.status != ApplicationStatus.WISHLIST and application.applied_on is None:
        application.applied_on = _today()


def _change_status(db: Session, application: Application, new_status: ApplicationStatus) -> None:
    old_status = application.status
    if new_status == old_status:
        return
    application.status = new_status
    _log_status_change(db, application, old_status, new_status)
    _fill_applied_on(application)


# --------------------------------------------------------------------------- CRUD


def create_application(db: Session, user: User, data: ApplicationCreate) -> Application:
    fields = data.model_dump(exclude={"tag_ids"})
    if data.resume_version_id is not None:
        _check_resume_version(db, user, data.resume_version_id)

    application = Application(
        **fields,
        id=uuid.uuid4(),
        user_id=user.id,
        position=_end_of_column(db, user, data.status),
        tags=_resolve_tags(db, user, data.tag_ids),
    )
    _fill_applied_on(application)
    db.add(application)
    # Flush first: events have no ORM relationship to their application, so nothing would
    # otherwise guarantee the application row is INSERTed before the event that references it.
    db.flush()
    # The timeline starts with the initial status.
    _log_status_change(db, application, None, application.status)
    db.commit()
    return application


def update_application(
    db: Session, user: User, application_id: uuid.UUID, data: ApplicationUpdate
) -> Application:
    application = get_application(db, user, application_id)
    changes: dict[str, Any] = data.model_dump(exclude_unset=True)

    if "tag_ids" in changes:
        application.tags = _resolve_tags(db, user, changes.pop("tag_ids"))
    new_resume = changes.get("resume_version_id")
    if new_resume is not None and new_resume != application.resume_version_id:
        _check_resume_version(db, user, new_resume)
    new_status: ApplicationStatus | None = changes.pop("status", None)

    for field, value in changes.items():
        setattr(application, field, value)

    if (
        application.salary_min is not None
        and application.salary_max is not None
        and application.salary_min > application.salary_max
    ):
        raise UnprocessableError("salary_min must not be greater than salary_max")

    if new_status is not None and new_status != application.status:
        # Changing status from the edit form: the card goes to the end of its new column.
        application.position = _end_of_column(db, user, new_status)
        _change_status(db, application, new_status)

    db.commit()
    return application


def delete_application(db: Session, user: User, application_id: uuid.UUID) -> None:
    db.delete(get_application(db, user, application_id))  # events/contacts cascade
    db.commit()


# --------------------------------------------------------------------------- kanban


def move_application(
    db: Session, user: User, application_id: uuid.UUID, move: MoveRequest
) -> Application:
    application = get_application(db, user, application_id)
    application.position = move.position
    _change_status(db, application, move.status)
    db.flush()
    _respace_column_if_crowded(db, user, application)
    db.commit()
    return application


def _respace_column_if_crowded(db: Session, user: User, moved: Application) -> None:
    column = list(
        db.scalars(
            select(Application).where(
                Application.user_id == user.id, Application.status == moved.status
            )
        )
    )
    # On a tie, the card that was just dropped goes first (it was dropped "before" it).
    column.sort(key=lambda a: (a.position, a.id != moved.id, a.created_at, a.id))
    gaps = (b.position - a.position for a, b in pairwise(column))
    if any(gap < MIN_POSITION_GAP for gap in gaps):
        for index, application in enumerate(column, start=1):
            application.position = index * POSITION_STEP


def get_board(db: Session, user: User) -> dict[ApplicationStatus, list[Application]]:
    board: dict[ApplicationStatus, list[Application]] = {status: [] for status in ApplicationStatus}
    applications = db.scalars(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.position, Application.created_at, Application.id)
    )
    for application in applications:
        board[application.status].append(application)
    return board


# --------------------------------------------------------------------------- list / search

_SORTS: dict[ApplicationSort, tuple[ColumnElement[Any], ...]] = {
    ApplicationSort.APPLIED_ON_DESC: (Application.applied_on.desc().nulls_last(),),
    ApplicationSort.APPLIED_ON: (Application.applied_on.asc().nulls_last(),),
    ApplicationSort.CREATED_AT_DESC: (Application.created_at.desc(),),
    ApplicationSort.CREATED_AT: (Application.created_at.asc(),),
    ApplicationSort.UPDATED_AT_DESC: (Application.updated_at.desc(),),
    ApplicationSort.COMPANY: (func.lower(Application.company).asc(),),
    ApplicationSort.COMPANY_DESC: (func.lower(Application.company).desc(),),
    ApplicationSort.DEADLINE_ON: (Application.deadline_on.asc().nulls_last(),),
}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_condition(q: str) -> ColumnElement[bool]:
    """Substring match (ILIKE) plus typo-tolerant trigram similarity (pg_trgm `%`),
    on company and role title. Both are served by the GIN trigram indexes."""
    pattern = f"%{_escape_like(q)}%"
    return or_(
        Application.company.ilike(pattern, escape="\\"),
        Application.role_title.ilike(pattern, escape="\\"),
        Application.company.op("%")(q),
        Application.role_title.op("%")(q),
    )


def _filtered(user: User, filters: ApplicationFilters) -> Select[Application]:
    stmt = select(Application).where(Application.user_id == user.id)
    q = (filters.q or "").strip()
    if q:
        stmt = stmt.where(_search_condition(q))
    if filters.statuses:
        stmt = stmt.where(Application.status.in_(filters.statuses))
    if filters.sources:
        stmt = stmt.where(func.lower(Application.source).in_([s.lower() for s in filters.sources]))
    if filters.tag_ids:  # any of the given tags
        stmt = stmt.where(
            exists().where(
                application_tags.c.application_id == Application.id,
                application_tags.c.tag_id.in_(filters.tag_ids),
            )
        )
    if filters.applied_from is not None:
        stmt = stmt.where(Application.applied_on >= filters.applied_from)
    if filters.applied_to is not None:
        stmt = stmt.where(Application.applied_on <= filters.applied_to)
    return stmt


def list_applications(
    db: Session, user: User, filters: ApplicationFilters
) -> tuple[list[Application], int]:
    stmt = _filtered(user, filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page = list(
        db.scalars(
            stmt.order_by(*_SORTS[filters.sort], Application.id)
            .limit(filters.page_size)
            .offset((filters.page - 1) * filters.page_size)
        )
    )
    return page, total


def page_count(total: int, page_size: int) -> int:
    return math.ceil(total / page_size)


# --------------------------------------------------------------------------- timeline


def list_events(db: Session, user: User, application_id: uuid.UUID) -> list[ApplicationEvent]:
    get_application(db, user, application_id)  # ownership check
    return list(
        db.scalars(
            select(ApplicationEvent)
            .where(ApplicationEvent.application_id == application_id)
            .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id)
        )
    )


def add_note(db: Session, user: User, application_id: uuid.UUID, body: str) -> ApplicationEvent:
    get_application(db, user, application_id)
    note = ApplicationEvent(
        application_id=application_id, type=EventType.NOTE, body=body, created_at=_now()
    )
    db.add(note)
    db.commit()
    return note
