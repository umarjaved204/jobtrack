import logging
from collections.abc import Iterator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.logging import configure_logging
from app.db.session import get_db
from app.main import create_app


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_returns_ok_when_database_is_reachable(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class _UnreachableDatabaseSession:
    """Stands in for a Session whose database is down (no slow real network timeout)."""

    def execute(self, *_: Any, **__: Any) -> None:
        raise OperationalError("SELECT 1", {}, ConnectionRefusedError("connection refused"))


def test_ready_returns_503_when_database_is_down() -> None:
    def unreachable_db() -> Iterator[_UnreachableDatabaseSession]:
        yield _UnreachableDatabaseSession()

    app = create_app()
    app.dependency_overrides[get_db] = unreachable_db
    with TestClient(app) as client:
        response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_health_checks_are_kept_out_of_the_access_log() -> None:
    configure_logging()
    access_logger = logging.getLogger("uvicorn.access")

    def is_logged(path: str) -> bool:
        record = logging.LogRecord(
            "uvicorn.access",
            logging.INFO,
            __file__,
            0,
            "%s - %s %s HTTP/%s %d",
            ("127.0.0.1:5000", "GET", path, "1.1", 200),
            None,
        )
        return access_logger.filter(record) is not False

    assert not is_logged("/api/v1/health")
    assert not is_logged("/api/v1/health/ready")
    assert is_logged("/api/v1/auth/login")
