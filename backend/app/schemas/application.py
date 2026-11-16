import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    TypeAdapter,
    model_validator,
)

from app.models.enums import ApplicationStatus, EventType, WorkMode
from app.schemas.tag import TagRead

Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Source = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# ISO 4217 code, accepted in any case and stored upper-case ("usd" -> "USD").
Currency = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$"),
]
Salary = Annotated[int, Field(ge=0, le=100_000_000)]

_http_url = TypeAdapter(HttpUrl)


def _validate_job_url(value: str) -> str:
    url = str(_http_url.validate_python(value))  # http(s) only, normalised
    if len(url) > 2048:  # HttpUrl allows 2083; the column holds 2048
        raise ValueError("URL must be at most 2048 characters")
    return url


# Validated as an http(s) URL, but typed and stored as a plain string.
JobUrl = Annotated[str, AfterValidator(_validate_job_url)]


def _check_salary_range(salary_min: int | None, salary_max: int | None) -> None:
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise ValueError("salary_min must not be greater than salary_max")


class ApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company: Text200
    role_title: Text200
    location: Text200 | None = None
    work_mode: WorkMode | None = None
    job_url: JobUrl | None = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    salary_currency: Currency | None = None
    source: Source | None = None
    status: ApplicationStatus = ApplicationStatus.WISHLIST
    applied_on: date | None = None
    deadline_on: date | None = None
    resume_version_id: uuid.UUID | None = None
    tag_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _salary_range(self) -> Self:
        _check_salary_range(self.salary_min, self.salary_max)
        return self


class ApplicationUpdate(BaseModel):
    """PATCH: only sent fields change. Send null to clear an optional field.
    The salary range is re-checked in the service against the merged values."""

    model_config = ConfigDict(extra="forbid")

    company: Text200 | None = None
    role_title: Text200 | None = None
    location: Text200 | None = None
    work_mode: WorkMode | None = None
    job_url: JobUrl | None = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    salary_currency: Currency | None = None
    source: Source | None = None
    status: ApplicationStatus | None = None
    applied_on: date | None = None
    deadline_on: date | None = None
    resume_version_id: uuid.UUID | None = None
    tag_ids: list[uuid.UUID] | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _required_fields_not_cleared(self) -> Self:
        for name in ("company", "role_title", "status", "tag_ids"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company: str
    role_title: str
    location: str | None
    work_mode: WorkMode | None
    job_url: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    status: ApplicationStatus
    position: float
    applied_on: date | None
    deadline_on: date | None
    resume_version_id: uuid.UUID | None
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime


class MoveRequest(BaseModel):
    """Kanban drop: target column and float position. The client sends the midpoint of
    the two neighbours it was dropped between (or a value past either end)."""

    status: ApplicationStatus
    position: float = Field(allow_inf_nan=False)


class BoardColumn(BaseModel):
    status: ApplicationStatus
    applications: list[ApplicationRead]


class Board(BaseModel):
    columns: list[BoardColumn]


class ApplicationSort(StrEnum):
    APPLIED_ON_DESC = "-applied_on"
    APPLIED_ON = "applied_on"
    CREATED_AT_DESC = "-created_at"
    CREATED_AT = "created_at"
    UPDATED_AT_DESC = "-updated_at"
    COMPANY = "company"
    COMPANY_DESC = "-company"
    DEADLINE_ON = "deadline_on"


class NoteCreate(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: EventType
    from_status: ApplicationStatus | None
    to_status: ApplicationStatus | None
    body: str | None
    created_at: datetime


class ApplicationFilters(BaseModel):
    """Parsed query parameters for GET /applications."""

    q: str | None = None
    statuses: list[ApplicationStatus] = []
    sources: list[str] = []
    tag_ids: list[uuid.UUID] = []
    applied_from: date | None = None
    applied_to: date | None = None
    sort: ApplicationSort = ApplicationSort.CREATED_AT_DESC
    page: int = 1
    page_size: int = 20
