"""The dev seed: realistic, rule-abiding, reproducible history (Phase 7's charts read it)."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Application, ApplicationEvent, User
from app.models.enums import ApplicationStatus, EventType
from app.services import applications as applications_service
from app.services import auth as auth_service
from scripts import seed
from tests.fake_dns import FakeResolver

NOW = datetime(2026, 11, 17, 12, 0, tzinfo=UTC)


@pytest.fixture
def seeded(db: Session) -> seed.SeedSummary:
    return seed.seed_demo_data(db, now=NOW)


def demo_applications(db: Session, user_id: str) -> list[Application]:
    return list(
        db.scalars(
            select(Application).where(Application.user_id == user_id).order_by(Application.company)
        )
    )


def status_events(db: Session, application: Application) -> list[ApplicationEvent]:
    return list(
        db.scalars(
            select(ApplicationEvent)
            .where(
                ApplicationEvent.application_id == application.id,
                ApplicationEvent.type == EventType.STATUS_CHANGE,
            )
            .order_by(ApplicationEvent.created_at)
        )
    )


def test_creates_a_varied_pipeline(seeded: seed.SeedSummary) -> None:
    assert seeded.applications == len(seed.COMPANIES)
    # Every stage the dashboard funnel shows is represented.
    for status in (
        ApplicationStatus.WISHLIST,
        ApplicationStatus.APPLIED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
    ):
        assert seeded.by_status[status] > 0, status
    assert seeded.notes > 0
    assert seeded.contacts > 0


def test_history_follows_the_app_rules(db: Session, seeded: seed.SeedSummary) -> None:
    window_start = NOW - timedelta(days=seed.HISTORY_DAYS)
    for application in demo_applications(db, seeded.user_id):
        events = status_events(db, application)
        times = [e.created_at for e in events]

        assert events[0].from_status is None, application.company  # timeline starts empty
        assert events[-1].to_status == application.status
        for previous, current in pairwise(events):
            assert current.from_status == previous.to_status
        assert times == sorted(times)
        assert all(window_start <= t < NOW for t in times), application.company

        # The database-clock columns match the backdated history.
        assert application.created_at == times[0]
        assert application.updated_at >= times[-1]

        # applied_on: set (by the service) on the day it left the wishlist, never otherwise.
        left_wishlist = next((e for e in events if e.to_status != ApplicationStatus.WISHLIST), None)
        if left_wishlist is None:
            assert application.applied_on is None
        else:
            assert application.applied_on == left_wishlist.created_at.date()


def test_is_reproducible_and_replaces_the_previous_demo_user(db: Session) -> None:
    first = seed.seed_demo_data(db, now=NOW)
    snapshot = [
        (a.company, a.role_title, a.status, a.applied_on)
        for a in demo_applications(db, first.user_id)
    ]

    second = seed.seed_demo_data(db, now=NOW)

    assert second.user_id != first.user_id  # deleted and recreated
    assert db.scalar(select(func.count()).where(User.email == seed.DEMO_EMAIL)) == 1
    assert db.scalar(select(func.count()).where(Application.user_id == first.user_id)) == 0
    assert snapshot == [
        (a.company, a.role_title, a.status, a.applied_on)
        for a in demo_applications(db, second.user_id)
    ]


def test_demo_account_signs_in_with_the_printed_password(
    db: Session, seeded: seed.SeedSummary
) -> None:
    user = auth_service.authenticate(db, seed.DEMO_EMAIL, seed.DEMO_PASSWORD)
    assert str(user.id) == seeded.user_id


def test_skips_the_dns_check_and_restores_settings(db: Session, fake_dns: FakeResolver) -> None:
    original_now = applications_service._now
    seed.seed_demo_data(db, now=NOW)

    assert fake_dns.queries == []
    assert get_settings().email_domain_check_enabled is True
    assert applications_service._now is original_now


def test_refuses_to_run_in_production(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(get_settings(), "environment", "production")

    def no_database() -> None:
        raise AssertionError("must not touch the database in production")

    monkeypatch.setattr(seed, "SessionLocal", no_database)

    assert seed.main() == 1
    assert "Refusing to seed" in capsys.readouterr().err
