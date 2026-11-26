"""The e2e launcher drops its database on start: it must refuse anything but an e2e one."""

import pytest

from scripts.e2e_server import refusal

E2E = "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack_e2e"


def test_allows_an_e2e_database_outside_production() -> None:
    assert refusal(E2E, "test") is None
    assert refusal(E2E, "local") is None


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack",
        "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack_test",
        "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack_e2e_backup",
        "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/",
    ],
)
def test_refuses_other_databases(url: str) -> None:
    reason = refusal(url, "test")
    assert reason is not None
    assert "_e2e" in reason


def test_refuses_production_even_for_an_e2e_database() -> None:
    assert refusal(E2E, "production") == "ENVIRONMENT is production"
