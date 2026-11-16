import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.session import connect_args, engine
from tests.conftest import TEST_DATABASE_URL


def test_app_engine_pre_pings_pooled_connections() -> None:
    assert engine.pool._pre_ping is True


def test_statement_timeout_is_applied_to_every_connection() -> None:
    test_engine = create_engine(TEST_DATABASE_URL, connect_args=connect_args(get_settings()))
    with test_engine.connect() as conn:
        assert conn.scalar(text("SHOW statement_timeout")) == "20s"
    test_engine.dispose()


def test_statement_timeout_cancels_slow_queries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "db_statement_timeout_ms", 200)
    test_engine = create_engine(TEST_DATABASE_URL, connect_args=connect_args(get_settings()))

    with test_engine.connect() as conn, pytest.raises(OperationalError, match="statement timeout"):
        conn.execute(text("SELECT pg_sleep(2)"))
    test_engine.dispose()


def test_statement_timeout_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "db_statement_timeout_ms", 0)

    assert "options" not in connect_args(get_settings())
