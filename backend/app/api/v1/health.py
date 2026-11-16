from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]


@router.get("/health")
def health() -> HealthResponse:
    """Liveness probe: the process is up. Does not touch the database
    (a DB-backed readiness probe, /health/ready, arrives in Phase 2)."""
    return HealthResponse(status="ok")
