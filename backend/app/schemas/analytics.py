"""Dashboard analytics. Definitions: docs/architecture.md, "Dashboard metrics"."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ApplicationStatus

# A rate is a fraction in [0, 1], or None when its denominator is 0 (nothing to divide by).
Rate = float | None


class Summary(BaseModel):
    applied: int = Field(description="Cohort applications that reached Applied or later")
    active: int = Field(description="Cohort applications now in Applied/Screening/Interview/Offer")
    interviewed: int = Field(description="Cohort applications that reached Interview or later")
    offers: int = Field(description="Cohort applications that reached Offer")
    interview_rate: Rate = Field(description="interviewed / applied")
    offer_rate: Rate = Field(description="offers / applied")
    wishlist: int = Field(description="Applications now on the wishlist (ignores the range)")


class FunnelStage(BaseModel):
    stage: ApplicationStatus
    count: int = Field(description="Cohort applications that reached this stage or a later one")
    rate_from_previous: Rate = Field(description="count / previous stage's count (None first)")


class Funnel(BaseModel):
    stages: list[FunnelStage]


class SourceRow(BaseModel):
    source: str | None = Field(description="Most common spelling of the source; None = not set")
    applied: int
    interviewed: int
    interview_rate: Rate


class Sources(BaseModel):
    sources: list[SourceRow]


class TimeseriesPoint(BaseModel):
    start: date = Field(description="First day of the bucket (a Monday, or the 1st)")
    count: int = Field(description="Cohort applications with applied_on in this bucket")


class Timeseries(BaseModel):
    interval: Literal["week", "month"]
    points: list[TimeseriesPoint]
