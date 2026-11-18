"""The dev seed: realistic, rule-abiding, reproducible history (Phase 7's charts read it)."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Application, ApplicationEvent, User
from app.models.enums import ApplicationStatus, CalendarEventKind, EventType
from app.schemas.reminder import ReminderStatus
from app.services import analytics, reminders, resumes
from app.services import applications as applications_service
from app.services import auth as auth_service
from app.services import calendar as calendar_service
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


def test_gives_the_dashboard_something_to_show(db: Session, seeded: seed.SeedSummary) -> None:
    user = db.get(User, seeded.user_id)
    assert user is not None
    last_90_days = analytics.Period(start=NOW.date() - timedelta(days=90), end=NOW.date())

    summary = analytics.summary(db, user, last_90_days)
    assert summary.applied >= 20
    assert 0 < summary.interviewed < summary.applied
    assert summary.offers >= 1
    assert summary.wishlist >= 1
    stages = [stage.count for stage in analytics.funnel(db, user, last_90_days).stages]
    assert stages == sorted(stages, reverse=True)
    assert len(analytics.sources(db, user, last_90_days).sources) >= 4
    weeks = analytics.timeseries(db, user, last_90_days).points
    assert sum(1 for week in weeks if week.count) >= 8  # spread out, not one spike


def test_resume_versions_show_every_state(db: Session, seeded: seed.SeedSummary) -> None:
    user = db.get_one(User, seeded.user_id)
    versions = {r.label: r for r in resumes.list_resumes(db, user)}

    assert seeded.resumes == len(seed.RESUMES) == len(versions)
    default = [r for r in versions.values() if r.is_default]
    assert [r.label for r in default] == [seed.DEFAULT_RESUME]
    archived = [r for r in versions.values() if r.archived_at is not None]
    assert len(archived) == 1 and archived[0].application_count > 0  # kept for history
    assert all(r.application_count > 0 for r in default)
    assert any(r.application_count == r.match_count == 0 for r in versions.values())  # deletable

    # Every application that went past the wishlist was sent with a resume; wishlist-only
    # ideas weren't. And none points at another user's resume.
    for application in demo_applications(db, seeded.user_id):
        events = status_events(db, application)
        applied = any(e.to_status != ApplicationStatus.WISHLIST for e in events)
        if application.resume_version_id is None:
            assert not applied, application.company
        else:
            assert application.resume_version_id in {r.id for r in versions.values()}


def test_reminders_and_events_cover_every_ui_state(db: Session, seeded: seed.SeedSummary) -> None:
    user = db.get_one(User, seeded.user_id)
    today = NOW.date()
    everything = reminders.list_reminders(db, user, ReminderStatus.ALL)
    open_ = [r for r in everything if r.done_at is None]

    assert seeded.reminders == len(everything)
    assert any(r.done_at is not None for r in everything)
    assert any(r.due_on is not None for r in open_) and any(r.due_at is not None for r in open_)
    due_days = [d for r in open_ for d in (r.due_on, r.due_at and r.due_at.date()) if d]
    assert any(d < today for d in due_days)  # overdue
    assert any(d < today - timedelta(days=30) for d in due_days)  # beyond the 30-day cap
    assert today in due_days
    assert any(d > today for d in due_days)
    assert any(r.application is None for r in open_) and any(r.application for r in open_)

    events = calendar_service.list_events(db, user)
    assert seeded.events == len(events)
    kinds = {e.kind for e in events}
    assert {CalendarEventKind.INTERVIEW, CalendarEventKind.ASSESSMENT} <= kinds
    assert CalendarEventKind.DEADLINE in kinds
    assert any(e.ends_at and e.ends_at.date() > e.starts_at.date() for e in events)  # overnight
    assert any(e.ends_at and e.ends_at - e.starts_at > timedelta(days=1) for e in events)
    assert any(e.starts_at < NOW for e in events) and any(e.starts_at > NOW for e in events)
    links = [e.location_or_link for e in events if e.location_or_link]
    assert any(link.startswith("https://") for link in links)
    assert any(not link.startswith("http") for link in links)

    # The next two weeks of the calendar have a bit of everything.
    next_two_weeks = calendar_service.calendar_feed(db, user, NOW, NOW + timedelta(days=14))
    assert {item.type for item in next_two_weeks.items} >= {"event", "reminder"}


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
