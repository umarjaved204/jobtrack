from typing import Literal

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DbSession

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]


@router.get("")
def health() -> HealthResponse:
    """Liveness: the process is up. Never touches the database, so a DB outage
    doesn't make the platform restart a healthy process."""
    return HealthResponse(status="ok")


@router.get(
    "/ready",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Database unreachable"}},
)
def ready(db: DbSession) -> HealthResponse | JSONResponse:
    """Readiness: the API can serve requests (database reachable)."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=HealthResponse(status="unavailable").model_dump(),
        )
    return HealthResponse(status="ok")
