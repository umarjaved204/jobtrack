import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.common import Page
from app.schemas.match import (
    MatchConfig,
    MatchCreate,
    MatchPrepare,
    MatchPrepared,
    MatchRead,
    MatchSummary,
)
from app.services.match import service

router = APIRouter(prefix="/match", tags=["match"])

_LIMITED_OR_OFF: dict[int | str, dict[str, Any]] = {
    429: {"description": "Too many matches; see the Retry-After header"},
    503: {"description": "Matching is switched off, or busy (server mode; see Retry-After)"},
}


@router.get("/config")
def get_config(_: CurrentUser) -> MatchConfig:
    """Where embeddings are computed, the model the browser loads, and the limits."""
    return service.get_config()


@router.post("/prepare", responses=_LIMITED_OR_OFF)
def prepare_match(data: MatchPrepare, user: CurrentUser, db: DbSession) -> MatchPrepared:
    """Client mode: the chunks to embed in the browser, and a digest to send back."""
    return service.prepare(db, user, data)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        **_LIMITED_OR_OFF,
        409: {"description": "The texts changed since /match/prepare: prepare again"},
    },
)
def create_match(data: MatchCreate, user: CurrentUser, db: DbSession) -> MatchRead:
    """Score a job description against a resume version and save the result."""
    return service.create_match(db, user, data)


@router.get("", response_model=Page[MatchSummary])
def list_matches(
    user: CurrentUser,
    db: DbSession,
    application_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[MatchSummary]:
    return service.list_matches(
        db, user, application_id=application_id, page=page, page_size=page_size
    )


@router.get("/{match_id}")
def get_match(match_id: uuid.UUID, user: CurrentUser, db: DbSession) -> MatchRead:
    return service.get_match(db, user, match_id)
