from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.analytics import Funnel, Sources, Summary, Timeseries
from app.services import analytics as service
from app.services.analytics import Period

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _period(
    applied_from: Annotated[
        date | None, Query(alias="from", description="Cohort: applied_on on or after")
    ] = None,
    applied_to: Annotated[
        date | None, Query(alias="to", description="Cohort: applied_on on or before")
    ] = None,
) -> Period:
    return Period(start=applied_from, end=applied_to)


PeriodQuery = Annotated[Period, Depends(_period)]


@router.get("/summary")
def get_summary(user: CurrentUser, db: DbSession, period: PeriodQuery) -> Summary:
    """Stat cards. Range-scoped figures use the cohort; `wishlist` ignores the range."""
    return service.summary(db, user, period)


@router.get("/funnel")
def get_funnel(user: CurrentUser, db: DbSession, period: PeriodQuery) -> Funnel:
    """Applied → Screening → Interview → Offer: how many cohort applications reached each."""
    return service.funnel(db, user, period)


@router.get("/sources")
def get_sources(user: CurrentUser, db: DbSession, period: PeriodQuery) -> Sources:
    """Per source: applied, interviewed and interview rate (case-insensitive grouping)."""
    return service.sources(db, user, period)


@router.get("/timeseries")
def get_timeseries(user: CurrentUser, db: DbSession, period: PeriodQuery) -> Timeseries:
    """Applications per ISO week (or month, for long ranges), zero-filled."""
    return service.timeseries(db, user, period)
