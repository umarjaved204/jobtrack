"""Test fixtures: a real PostgreSQL test database, one rolled-back transaction per test.

Requires Postgres (e.g. `docker compose up -d db`). Override the location with
TEST_DATABASE_URL; the database is created automatically if it doesn't exist.
"""

import os

# Must run before any `app` import: the engine and settings are created at import time.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENVIRONMENT"] = "test"

from collections.abc import Callable, Iterator  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import dns.resolver  # noqa: E402
import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine, create_engine, make_url, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from alembic import command  # noqa: E402
from app.core import email_domain  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import connect_args, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fake_dns import FakeResolver  # noqa: E402

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
DEFAULT_PASSWORD = "correct-horse-battery"


def _create_database_if_missing(url: str) -> None:
    parsed = make_url(url)
    admin = create_engine(parsed.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": parsed.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{parsed.database}"'))
    admin.dispose()


def _alembic_config(url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.attributes["configure_logger"] = False  # keep pytest's log capture intact
    return cfg


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    _create_database_if_missing(TEST_DATABASE_URL)
    # Same connection options as the app (connect + statement timeouts).
    eng = create_engine(TEST_DATABASE_URL, connect_args=connect_args(get_settings()))
    with eng.begin() as conn:  # start from an empty schema every run
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    # Build the schema through the real migrations (and prove downgrade works too).
    cfg = _alembic_config(TEST_DATABASE_URL)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")

    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch: pytest.MonkeyPatch) -> FakeResolver:
    """Every test gets a fake resolver for the sign-up email domain check (by default every
    domain has an MX record), and any *real* DNS query fails the test: CI never hits DNS."""

    def _no_real_dns(*_: object, **__: object) -> None:
        raise AssertionError("Real DNS lookup attempted in a test; configure `fake_dns` instead")

    monkeypatch.setattr(dns.resolver.Resolver, "resolve", _no_real_dns)
    monkeypatch.setattr(dns.resolver, "resolve", _no_real_dns)
    fake = FakeResolver()
    monkeypatch.setattr(email_domain, "get_resolver", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    """The limiter is process-global; give every test a clean slate."""
    limiter.reset()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session whose work is rolled back after the test, even though services commit:
    with `create_savepoint`, each commit() only releases a SAVEPOINT inside our transaction."""
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c


@pytest.fixture
def refresh_cookie_name() -> str:
    return get_settings().refresh_cookie_name


@pytest.fixture
def register(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Register a user and return the auth response body."""

    def _register(
        email: str = "ayesha.khan@example.com",
        password: str = DEFAULT_PASSWORD,
        full_name: str = "Ayesha Khan",
    ) -> dict[str, Any]:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "full_name": full_name},
        )
        assert response.status_code == 201, response.text
        body: dict[str, Any] = response.json()
        return body

    return _register


def auth_header(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
