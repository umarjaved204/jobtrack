"""Dashboard analytics.

Every range-scoped figure is computed over one *cohort*: the user's applications whose
`applied_on` falls in the requested range (all dated applications when there is no range).
"Reached a stage" comes from the timeline (status_change events), not the current status,
so an application rejected after an interview still counts as interviewed.

Stages are ranked Applied < Screening < Interview < Offer; reaching a stage counts every
stage before it (skipped stages included). Rejected and Withdrawn are outcomes, not stages,
so an application that went from the wishlist straight to Withdrawn never reached Applied
and is left out of every count, even though leaving the wishlist gave it an applied_on.

Known trade-off: a mistaken move to a later stage that is moved back still counts as
reached; the history doesn't say which moves were mistakes.

Volumes are per user (hundreds of rows), so the cohort is loaded with one query and
aggregated in Python, which keeps the definitions readable and in one place.
"""

import uuid
from collections import Counter, defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.errors import FieldValidationError
from app.models import Application, ApplicationEvent, User
from app.models.enums import ApplicationStatus, EventType
from app.schemas.analytics import (
    Funnel,
    FunnelStage,
    Move,
    Moves,
    Rate,
    SourceRow,
    Sources,
    Summary,
    Timeseries,
    TimeseriesPoint,
)

FUNNEL_STAGES = (
    ApplicationStatus.APPLIED,
    ApplicationStatus.SCREENING,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
)
_RANK = {stage: rank for rank, stage in enumerate(FUNNEL_STAGES, start=1)}
APPLIED, SCREENING, INTERVIEW, OFFER = (_RANK[s] for s in FUNNEL_STAGES)

# Above this span the time series uses monthly buckets (~26 weeks of weekly bars at most).
MONTHLY_AFTER_DAYS = 26 * 7


@dataclass(frozen=True)
class Period:
    """Inclusive applied_on range; either end may be open."""

    start: date | None = None
    end: date | None = None

    def __post_init__(self) -> None:
        if self.start and self.end and self.start > self.end:
            raise FieldValidationError("to", "The end date must be on or after the start date")


@dataclass(frozen=True)
class _CohortRow:
    status: ApplicationStatus
    source: str | None
    applied_on: date
    furthest: int  # highest stage rank ever reached (0: never reached Applied)


def _cohort(db: Session, user: User, period: Period) -> list[_CohortRow]:
    conditions = [Application.user_id == user.id, Application.applied_on.is_not(None)]
    if period.start:
        conditions.append(Application.applied_on >= period.start)
    if period.end:
        conditions.append(Application.applied_on <= period.end)

    rows = db.execute(
        select(
            Application.id,
            Application.status,
            Application.source,
            Application.applied_on,
            ApplicationEvent.to_status,
        )
        .outerjoin(
            ApplicationEvent,
            and_(
                ApplicationEvent.application_id == Application.id,
                ApplicationEvent.type == EventType.STATUS_CHANGE,
            ),
        )
        .where(*conditions)
    ).all()

    apps: dict[uuid.UUID, tuple[ApplicationStatus, str | None, date]] = {}
    furthest: defaultdict[uuid.UUID, int] = defaultdict(int)
    for app_id, status, source, applied_on, to_status in rows:
        if applied_on is None:  # excluded by the query; narrows the type
            continue
        apps[app_id] = (status, source, applied_on)
        for reached in (status, to_status):
            if reached is not None:
                furthest[app_id] = max(furthest[app_id], _RANK.get(reached, 0))
    return [
        _CohortRow(status, source, applied_on, furthest[app_id])
        for app_id, (status, source, applied_on) in apps.items()
    ]


def _rate(part: int, whole: int) -> Rate:
    return part / whole if whole else None


def _reached(cohort: list[_CohortRow], rank: int) -> int:
    return sum(1 for row in cohort if row.furthest >= rank)


# --------------------------------------------------------------------------- endpoints


def summary(db: Session, user: User, period: Period) -> Summary:
    cohort = _cohort(db, user, period)
    applied = _reached(cohort, APPLIED)
    interviewed = _reached(cohort, INTERVIEW)
    offers = _reached(cohort, OFFER)
    current = Counter(row.status for row in cohort if row.furthest >= APPLIED)
    wishlist = db.scalar(
        select(func.count())
        .select_from(Application)
        .where(Application.user_id == user.id, Application.status == ApplicationStatus.WISHLIST)
    )
    return Summary(
        applied=applied,
        active=sum(1 for row in cohort if row.status in _RANK),
        interviewed=interviewed,
        offers=offers,
        interview_rate=_rate(interviewed, applied),
        offer_rate=_rate(offers, applied),
        wishlist=wishlist or 0,
        by_status={status: current[status] for status in ApplicationStatus},
    )


def funnel(db: Session, user: User, period: Period) -> Funnel:
    cohort = _cohort(db, user, period)
    stages: list[FunnelStage] = []
    previous: int | None = None
    for stage in FUNNEL_STAGES:
        count = _reached(cohort, _RANK[stage])
        stages.append(
            FunnelStage(
                stage=stage,
                count=count,
                rate_from_previous=None if previous is None else _rate(count, previous),
            )
        )
        previous = count
    return Funnel(stages=stages)


def sources(db: Session, user: User, period: Period) -> Sources:
    """Applied and interviewed counts per source, grouped case-insensitively."""
    groups: defaultdict[str | None, list[_CohortRow]] = defaultdict(list)
    spellings: defaultdict[str | None, Counter[str]] = defaultdict(Counter)
    for row in _cohort(db, user, period):
        if row.furthest < APPLIED:
            continue
        text = row.source.strip() if row.source else None
        key = text.casefold() if text else None
        groups[key].append(row)
        if text:
            spellings[key][text] += 1

    def label(key: str | None) -> str | None:
        if key is None:
            return None
        # The most common spelling ("LinkedIn" over "linkedin"); ties go alphabetically.
        return min(spellings[key].items(), key=lambda item: (-item[1], item[0]))[0]

    result = []
    for key, rows in groups.items():
        applied = len(rows)
        interviewed = _reached(rows, INTERVIEW)
        result.append(
            SourceRow(
                source=label(key),
                applied=applied,
                interviewed=interviewed,
                interview_rate=_rate(interviewed, applied),
            )
        )
    # Most applications first; "not set" last among equals.
    result.sort(key=lambda r: (-r.applied, r.source is None, (r.source or "").casefold()))
    return Sources(sources=result)


def _bucket_start(day: date, interval: Literal["week", "month"]) -> date:
    return day - timedelta(days=day.weekday()) if interval == "week" else day.replace(day=1)


def _buckets(start: date, end: date, interval: Literal["week", "month"]) -> Iterator[date]:
    current = _bucket_start(start, interval)
    while current <= end:
        yield current
        if interval == "week":
            current += timedelta(days=7)
        else:
            current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)


def timeseries(db: Session, user: User, period: Period) -> Timeseries:
    """Applications per ISO week (Monday start), or per month for spans over ~26 weeks.
    Buckets are zero-filled across the whole range, so gaps show as zeros, not missing bars.
    An open end of the range is taken from the data."""
    dates = [row.applied_on for row in _cohort(db, user, period) if row.furthest >= APPLIED]
    start = period.start or (min(dates) if dates else None)
    end = period.end or (max(dates) if dates else None)
    if start is None or end is None:
        return Timeseries(interval="week", points=[])

    interval: Literal["week", "month"] = (
        "month" if (end - start).days > MONTHLY_AFTER_DAYS else "week"
    )
    counts = Counter(_bucket_start(day, interval) for day in dates)
    return Timeseries(
        interval=interval,
        points=[
            TimeseriesPoint(start=bucket, count=counts[bucket])
            for bucket in _buckets(start, end, interval)
        ],
    )


MOVES_DEFAULT_LIMIT = 5
MOVES_MAX_LIMIT = 20


def moves(db: Session, user: User, limit: int = MOVES_DEFAULT_LIMIT) -> Moves:
    """The user's latest status changes across all applications, newest first.

    Only real moves: the event logged when an application is created (no from_status) is
    left out. Not range-scoped: the dashboard shows what happened lately.
    """
    rows = db.execute(
        select(
            Application.id,
            Application.company,
            Application.role_title,
            ApplicationEvent.from_status,
            ApplicationEvent.to_status,
            ApplicationEvent.created_at,
        )
        .join(Application, Application.id == ApplicationEvent.application_id)
        .where(
            Application.user_id == user.id,
            ApplicationEvent.type == EventType.STATUS_CHANGE,
            ApplicationEvent.from_status.is_not(None),
            ApplicationEvent.to_status.is_not(None),
        )
        .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc())
        .limit(limit)
    ).all()
    return Moves(
        moves=[
            Move(
                application_id=app_id,
                company=company,
                role_title=role_title,
                from_status=from_status,
                to_status=to_status,
                moved_at=moved_at,
            )
            for app_id, company, role_title, from_status, to_status, moved_at in rows
            if from_status is not None and to_status is not None  # filtered above; narrows
        ]
    )
