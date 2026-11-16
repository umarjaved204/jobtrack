from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def connect_args(settings: Settings) -> dict[str, Any]:
    """libpq connection parameters shared by the app engine and Alembic."""
    args: dict[str, Any] = {
        # Fail fast if the server is unreachable (libpq's default is to wait forever).
        # Long enough to cover a Neon compute waking from suspend (usually < 1s).
        "connect_timeout": settings.db_connect_timeout_seconds,
    }
    if settings.db_statement_timeout_ms:
        # Server-side cap per statement: a runaway query is cancelled instead of
        # holding a pooled connection (and the request) indefinitely.
        args["options"] = f"-c statement_timeout={settings.db_statement_timeout_ms}"
    return args


_settings = get_settings()
engine = create_engine(
    str(_settings.database_url),
    # Test each pooled connection with a cheap round-trip before handing it out, so
    # connections closed while idle (Neon suspend, restarts) are replaced transparently.
    pool_pre_ping=True,
    connect_args=connect_args(_settings),
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    with SessionLocal() as session:
        yield session
