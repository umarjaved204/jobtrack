"""The API for the Playwright e2e tests: a fresh database, migrated, then served.

Run from backend/: `uv run python -m scripts.e2e_server` (Playwright's `webServer` runs it;
see frontend/playwright.config.ts).

- Drops and recreates the E2E_DATABASE_URL database on every start, so each run begins
  empty. Refuses a database whose name doesn't end in `_e2e`, and ENVIRONMENT=production.
- Turns off the auth rate limit and the sign-up DNS check: retries would trip the limit,
  and the tests must not depend on real DNS. Both have their own backend tests.
- Serves on 127.0.0.1:E2E_API_PORT (default 8001), away from the dev stack's 8000.

App modules are imported only after the environment is set: settings are read at import.
"""

import os
import sys

from sqlalchemy import create_engine, make_url, text

DEFAULT_DATABASE_URL = "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack_e2e"
DEFAULT_PORT = 8001


def refusal(database_url: str, environment: str) -> str | None:
    """Why this target must not be wiped, or None when it's safe."""
    if environment == "production":
        return "ENVIRONMENT is production"
    name = make_url(database_url).database or ""
    if not name.endswith("_e2e"):
        return f"database {name!r} doesn't end in _e2e (it would be dropped)"
    return None


def _recreate_database(database_url: str) -> None:
    url = make_url(database_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            # FORCE (Postgres 13+) closes connections left over from a previous run.
            conn.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin.dispose()


def _migrate(database_url: str) -> None:
    from pathlib import Path

    from alembic.config import Config

    from alembic import command

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


def main() -> int:
    database_url = os.environ.get("E2E_DATABASE_URL", DEFAULT_DATABASE_URL)
    reason = refusal(database_url, os.environ.get("ENVIRONMENT", "test"))
    if reason:
        print(f"Refusing to start the e2e API: {reason}.", file=sys.stderr)
        return 1

    os.environ.update(
        {
            "DATABASE_URL": database_url,
            "ENVIRONMENT": "test",
            "RATE_LIMIT_ENABLED": "false",
            "EMAIL_DOMAIN_CHECK_ENABLED": "false",
            "MATCH_EMBEDDINGS": "client",
        }
    )
    os.environ.pop("MIGRATION_DATABASE_URL", None)  # a .env value would point elsewhere

    _recreate_database(database_url)
    _migrate(database_url)

    import uvicorn

    port = int(os.environ.get("E2E_API_PORT", DEFAULT_PORT))
    print(f"e2e API on http://127.0.0.1:{port} (database {make_url(database_url).database})")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
