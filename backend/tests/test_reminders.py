import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Reminder, User
from tests.conftest import auth_header

REMINDERS = "/api/v1/reminders"
APPS = "/api/v1/applications"
Headers = dict[str, str]


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


def create(client: TestClient, headers: Headers, **fields: Any) -> dict[str, Any]:
    payload = {"title": "Follow up with the recruiter", "due_on": "2026-11-20"} | fields
    response = client.post(REMINDERS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def application(client: TestClient, headers: Headers, company: str = "Careem") -> str:
    response = client.post(
        APPS, headers=headers, json={"company": company, "role_title": "Backend Engineer"}
    )
    assert response.status_code == 201, response.text
    app_id: str = response.json()["id"]
    return app_id


def titles(client: TestClient, headers: Headers, query: str = "") -> list[str]:
    response = client.get(f"{REMINDERS}{query}", headers=headers)
    assert response.status_code == 200, response.text
    return [r["title"] for r in response.json()]


def patch(client: TestClient, headers: Headers, reminder_id: str, **fields: Any) -> Any:
    return client.patch(f"{REMINDERS}/{reminder_id}", headers=headers, json=fields)


# --------------------------------------------------------------------------- due date/time


def test_all_day_reminders_keep_their_date(client: TestClient, ayesha: Headers) -> None:
    """A date is never converted through UTC, so it can't drift to a neighbouring day."""
    created = create(client, ayesha, due_on="2026-11-20")

    assert created["due_on"] == "2026-11-20"
    assert created["due_at"] is None
    assert created["done_at"] is None


@pytest.mark.parametrize(
    ("sent", "stored"),
    [
        # Chicago is UTC-6 in winter: 23:30 local on the 14th is the 15th in UTC.
        ("2026-12-14T23:30:00-06:00", "2026-12-15T05:30:00Z"),
        # Positive offset: 08:00 in Karachi is 03:00 UTC.
        ("2026-11-20T08:00:00+05:00", "2026-11-20T03:00:00Z"),
        ("2026-11-20T09:00:00Z", "2026-11-20T09:00:00Z"),
    ],
)
def test_timed_reminders_are_stored_and_returned_in_utc(
    client: TestClient, ayesha: Headers, sent: str, stored: str
) -> None:
    created = create(client, ayesha, due_on=None, due_at=sent)

    assert created["due_at"] == stored
    assert created["due_on"] is None
    listed = client.get(REMINDERS, headers=ayesha).json()
    assert listed[0]["due_at"] == stored


def test_times_come_back_in_utc_whatever_the_session_time_zone(
    client: TestClient, db: Session, ayesha: Headers
) -> None:
    db.execute(text("SET TIME ZONE 'America/Chicago'"))  # the session the API uses in tests
    create(client, ayesha, due_on=None, due_at="2026-11-20T09:00:00Z")

    assert client.get(REMINDERS, headers=ayesha).json()[0]["due_at"] == "2026-11-20T09:00:00Z"


@pytest.mark.parametrize(
    "due",
    [
        {},  # neither
        {"due_on": None},
        {"due_on": "2026-11-20", "due_at": "2026-11-20T09:00:00Z"},  # both
        {"due_on": None, "due_at": "2026-11-20T09:00:00"},  # no offset: ambiguous
        {"due_on": "20/11/2026"},
    ],
)
def test_create_needs_exactly_one_valid_due(
    client: TestClient, ayesha: Headers, due: dict[str, Any]
) -> None:
    payload = {"title": "Send portfolio"} | due
    assert client.post(REMINDERS, headers=ayesha, json=payload).status_code == 422


def test_switching_between_all_day_and_timed(client: TestClient, ayesha: Headers) -> None:
    rid = create(client, ayesha, due_on="2026-11-20")["id"]

    timed = patch(client, ayesha, rid, due_at="2026-11-21T14:00:00+00:00").json()
    assert (timed["due_on"], timed["due_at"]) == (None, "2026-11-21T14:00:00Z")
    all_day = patch(client, ayesha, rid, due_on="2026-11-22").json()
    assert (all_day["due_on"], all_day["due_at"]) == ("2026-11-22", None)

    both = patch(client, ayesha, rid, due_on="2026-11-22", due_at="2026-11-22T09:00:00Z")
    cleared = patch(client, ayesha, rid, due_on=None)
    assert both.status_code == 422
    assert cleared.status_code == 422  # a reminder always has a due date


def test_the_database_enforces_exactly_one_due(db: Session, ayesha: Headers) -> None:
    user = db.scalars(select(User)).one()
    db.add(Reminder(user_id=user.id, title="Neither"))
    with pytest.raises(IntegrityError, match="one_due"):
        db.flush()
    db.rollback()


# --------------------------------------------------------------------------- CRUD + done


def test_update_title_and_delete(client: TestClient, ayesha: Headers) -> None:
    rid = create(client, ayesha)["id"]

    renamed = patch(client, ayesha, rid, title="  Chase the take-home feedback ")
    assert renamed.json()["title"] == "Chase the take-home feedback"
    assert patch(client, ayesha, rid, title=None).status_code == 422
    assert patch(client, ayesha, rid, title="").status_code == 422
    assert patch(client, ayesha, rid, done_at="2026-11-20T09:00:00Z").status_code == 422

    assert client.delete(f"{REMINDERS}/{rid}", headers=ayesha).status_code == 204
    assert client.delete(f"{REMINDERS}/{rid}", headers=ayesha).status_code == 404
    assert titles(client, ayesha, "?status=all") == []


def test_mark_done_and_undo(client: TestClient, ayesha: Headers) -> None:
    rid = create(client, ayesha, title="Send thank-you note")["id"]
    create(client, ayesha, title="Ask about salary band", due_on="2026-11-25")

    done = patch(client, ayesha, rid, done=True).json()
    again = patch(client, ayesha, rid, done=True).json()
    assert done["done_at"] is not None
    assert again["done_at"] == done["done_at"]  # marking done twice keeps the first time

    assert titles(client, ayesha) == ["Ask about salary band"]  # open is the default
    assert titles(client, ayesha, "?status=done") == ["Send thank-you note"]
    assert titles(client, ayesha, "?status=all") == ["Ask about salary band", "Send thank-you note"]

    reopened = patch(client, ayesha, rid, done=False).json()
    assert reopened["done_at"] is None
    assert titles(client, ayesha) == ["Send thank-you note", "Ask about salary band"]
    assert client.get(f"{REMINDERS}?status=snoozed", headers=ayesha).status_code == 422


def test_open_reminders_come_in_due_order(client: TestClient, ayesha: Headers) -> None:
    create(client, ayesha, title="Later", due_on="2026-11-30")
    create(client, ayesha, title="Timed, same day", due_on=None, due_at="2026-11-20T15:00:00Z")
    create(client, ayesha, title="All day", due_on="2026-11-20")
    create(client, ayesha, title="Earlier", due_on=None, due_at="2026-11-18T09:00:00Z")

    # All-day before timed on the same day.
    assert titles(client, ayesha) == ["Earlier", "All day", "Timed, same day", "Later"]


# --------------------------------------------------------------------------- applications


def test_reminders_link_to_the_users_own_applications(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    careem = application(client, ayesha, "Careem")
    wise = application(client, ayesha, "Wise")
    theirs = application(client, bilal, "Monzo")

    linked = create(client, ayesha, title="Follow up", application_id=careem)
    assert linked["application"] == {
        "id": careem,
        "company": "Careem",
        "role_title": "Backend Engineer",
    }
    create(client, ayesha, title="Unlinked")
    assert titles(client, ayesha, f"?application_id={careem}") == ["Follow up"]

    stolen = client.post(
        REMINDERS,
        headers=ayesha,
        json={"title": "x", "due_on": "2026-11-20", "application_id": theirs},
    )
    moved_to_theirs = patch(client, ayesha, linked["id"], application_id=theirs)
    assert stolen.status_code == 404
    assert moved_to_theirs.status_code == 404
    assert stolen.json() == {"detail": "Application not found"}

    moved = patch(client, ayesha, linked["id"], application_id=wise).json()
    assert moved["application"]["company"] == "Wise"
    unlinked = patch(client, ayesha, linked["id"], application_id=None).json()
    assert unlinked["application"] is None


def test_deleting_an_application_deletes_its_reminders(client: TestClient, ayesha: Headers) -> None:
    careem = application(client, ayesha)
    create(client, ayesha, title="Follow up with Careem", application_id=careem)
    create(client, ayesha, title="Update portfolio")

    assert client.delete(f"{APPS}/{careem}", headers=ayesha).status_code == 204
    assert titles(client, ayesha, "?status=all") == ["Update portfolio"]


def test_reminders_are_private(client: TestClient, ayesha: Headers, bilal: Headers) -> None:
    rid = create(client, ayesha)["id"]

    assert titles(client, bilal, "?status=all") == []
    assert patch(client, bilal, rid, done=True).status_code == 404
    assert client.delete(f"{REMINDERS}/{rid}", headers=bilal).status_code == 404
    assert patch(client, ayesha, str(uuid.uuid4()), done=True).status_code == 404
