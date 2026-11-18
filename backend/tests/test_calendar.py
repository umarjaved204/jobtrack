from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_header

EVENTS = "/api/v1/calendar-events"
FEED = "/api/v1/calendar"
APPS = "/api/v1/applications"
REMINDERS = "/api/v1/reminders"
Headers = dict[str, str]

# Offsets are written out (not computed) so each test states the wall clock it means.
# America/Chicago: CST is -06:00, CDT is -05:00; DST starts 2027-03-14 02:00 local
# (a 23-hour day) and ends 2027-11-07 02:00 local (a 25-hour day).
# Asia/Karachi: +05:00 all year.


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


def event(client: TestClient, headers: Headers, **fields: Any) -> dict[str, Any]:
    payload = {
        "kind": "interview",
        "title": "Technical interview",
        "starts_at": "2026-11-20T15:00:00Z",
        "ends_at": "2026-11-20T16:00:00Z",
    } | fields
    response = client.post(EVENTS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def application(client: TestClient, headers: Headers, **fields: Any) -> str:
    payload = {"company": "Careem", "role_title": "Backend Engineer"} | fields
    response = client.post(APPS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    app_id: str = response.json()["id"]
    return app_id


def reminder(client: TestClient, headers: Headers, **fields: Any) -> str:
    response = client.post(REMINDERS, headers=headers, json={"title": "Follow up"} | fields)
    assert response.status_code == 201, response.text
    reminder_id: str = response.json()["id"]
    return reminder_id


def feed(client: TestClient, headers: Headers, start: str, end: str, **params: Any) -> Any:
    return client.get(FEED, headers=headers, params={"from": start, "to": end} | params)


def titles(client: TestClient, headers: Headers, start: str, end: str, **params: Any) -> list[str]:
    response = feed(client, headers, start, end, **params)
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


# --------------------------------------------------------------------------- events CRUD


def test_create_read_update_delete(client: TestClient, ayesha: Headers) -> None:
    app_id = application(client, ayesha)
    created = event(
        client,
        ayesha,
        starts_at="2026-11-20T10:00:00-06:00",
        ends_at="2026-11-20T11:00:00-06:00",
        location_or_link="  https://meet.example.com/abc-defg-hij ",
        application_id=app_id,
    )

    assert created["starts_at"] == "2026-11-20T16:00:00Z"  # stored and returned in UTC
    assert created["ends_at"] == "2026-11-20T17:00:00Z"
    assert created["location_or_link"] == "https://meet.example.com/abc-defg-hij"
    assert created["application"] == {
        "id": app_id,
        "company": "Careem",
        "role_title": "Backend Engineer",
    }
    assert client.get(f"{EVENTS}?application_id={app_id}", headers=ayesha).json() == [created]

    eid = created["id"]
    updated = client.patch(
        f"{EVENTS}/{eid}",
        headers=ayesha,
        json={
            "kind": "assessment",
            "title": "Take-home",
            "ends_at": None,
            "location_or_link": None,
        },
    ).json()
    assert (updated["kind"], updated["title"]) == ("assessment", "Take-home")
    assert (updated["ends_at"], updated["location_or_link"]) == (None, None)

    assert client.delete(f"{EVENTS}/{eid}", headers=ayesha).status_code == 204
    assert client.get(EVENTS, headers=ayesha).json() == []


@pytest.mark.parametrize(
    "fields",
    [
        {"ends_at": "2026-11-20T14:59:00Z"},  # ends before it starts
        {"starts_at": "2026-11-20T15:00:00"},  # no offset
        {"kind": "deadline-ish"},
        {"title": "  "},
        {"location_or_link": "x" * 2049},
    ],
)
def test_create_validation(client: TestClient, ayesha: Headers, fields: dict[str, Any]) -> None:
    payload = {
        "kind": "interview",
        "title": "Technical interview",
        "starts_at": "2026-11-20T15:00:00Z",
    } | fields
    assert client.post(EVENTS, headers=ayesha, json=payload).status_code == 422


def test_update_rechecks_the_merged_start_and_end(client: TestClient, ayesha: Headers) -> None:
    eid = event(client, ayesha)["id"]  # 15:00 to 16:00 UTC

    late_start = client.patch(
        f"{EVENTS}/{eid}", headers=ayesha, json={"starts_at": "2026-11-20T17:00:00Z"}
    )
    null_start = client.patch(f"{EVENTS}/{eid}", headers=ayesha, json={"starts_at": None})
    zero_length = client.patch(
        f"{EVENTS}/{eid}", headers=ayesha, json={"ends_at": "2026-11-20T15:00:00Z"}
    )

    assert late_start.status_code == 422
    assert late_start.json()["detail"][0]["loc"] == ["body", "ends_at"]
    assert null_start.status_code == 422
    assert zero_length.status_code == 200


def test_events_link_only_to_the_users_own_applications(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    theirs = application(client, bilal, company="Monzo")
    eid = event(client, ayesha)["id"]

    on_create = client.post(
        EVENTS,
        headers=ayesha,
        json={
            "kind": "interview",
            "title": "x",
            "starts_at": "2026-11-20T15:00:00Z",
            "application_id": theirs,
        },
    )
    on_update = client.patch(f"{EVENTS}/{eid}", headers=ayesha, json={"application_id": theirs})

    assert on_create.status_code == 404
    assert on_update.status_code == 404


def test_events_are_private(client: TestClient, ayesha: Headers, bilal: Headers) -> None:
    eid = event(client, ayesha)["id"]

    assert client.get(EVENTS, headers=bilal).json() == []
    assert client.patch(f"{EVENTS}/{eid}", headers=bilal, json={"title": "x"}).status_code == 404
    assert client.delete(f"{EVENTS}/{eid}", headers=bilal).status_code == 404
    assert titles(client, bilal, "2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z") == []


def test_deleting_an_application_deletes_its_events(client: TestClient, ayesha: Headers) -> None:
    app_id = application(client, ayesha)
    event(client, ayesha, title="Onsite", application_id=app_id)
    event(client, ayesha, title="Coffee chat")

    client.delete(f"{APPS}/{app_id}", headers=ayesha)

    assert [e["title"] for e in client.get(EVENTS, headers=ayesha).json()] == ["Coffee chat"]


# --------------------------------------------------------------------------- feed: contents


def test_feed_merges_events_apply_by_dates_and_open_reminders(
    client: TestClient, ayesha: Headers
) -> None:
    wishlist = application(client, ayesha, company="Wise", deadline_on="2026-11-20")
    application(  # applied already: its apply-by date no longer matters
        client, ayesha, company="Monzo", status="applied", deadline_on="2026-11-20"
    )
    event(client, ayesha, title="Onsite", starts_at="2026-11-20T15:00:00Z", ends_at=None)
    reminder(client, ayesha, title="Send references", due_on="2026-11-20", application_id=wishlist)
    reminder(client, ayesha, title="Call recruiter", due_at="2026-11-20T09:00:00Z")
    done = reminder(client, ayesha, title="Already done", due_on="2026-11-20")
    client.patch(f"{REMINDERS}/{done}", headers=ayesha, json={"done": True})

    items = feed(client, ayesha, "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z").json()["items"]

    # All-day items first (by title), then timed ones in time order.
    assert [(i["type"], i["title"]) for i in items] == [
        ("apply_by", "Apply to Wise"),
        ("reminder", "Send references"),
        ("reminder", "Call recruiter"),
        ("event", "Onsite"),
    ]
    apply_by = items[0]
    assert apply_by == {
        "type": "apply_by",
        "id": wishlist,
        "title": "Apply to Wise",
        "date": "2026-11-20",
        "application": {"id": wishlist, "company": "Wise", "role_title": "Backend Engineer"},
    }
    assert items[1]["date"] == "2026-11-20" and items[1]["starts_at"] is None
    assert items[2]["date"] is None and items[2]["starts_at"] == "2026-11-20T09:00:00Z"
    assert items[1]["application"]["id"] == wishlist
    assert items[3]["kind"] == "interview"

    with_done = titles(
        client, ayesha, "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z", include_done=True
    )
    assert "Already done" in with_done


@pytest.mark.parametrize(
    ("start", "end", "error"),
    [
        ("2026-11-21T00:00:00Z", "2026-11-20T00:00:00Z", "'to' must be after 'from'"),
        ("2026-11-20T00:00:00Z", "2026-11-20T00:00:00Z", "'to' must be after 'from'"),
        ("2026-01-01T00:00:00Z", "2027-01-03T00:00:00Z", "The range can be at most 366 days"),
    ],
)
def test_feed_range_validation(
    client: TestClient, ayesha: Headers, start: str, end: str, error: str
) -> None:
    response = feed(client, ayesha, start, end)
    assert response.status_code == 422
    assert response.json() == {"detail": error}


def test_feed_needs_offsets_and_both_ends(client: TestClient, ayesha: Headers) -> None:
    assert feed(client, ayesha, "2026-11-20T00:00:00", "2026-11-21T00:00:00Z").status_code == 422
    missing_to = client.get(FEED, headers=ayesha, params={"from": "2026-11-20T00:00:00Z"})
    assert missing_to.status_code == 422


# --------------------------------------------------------------------------- feed: overlap


def test_events_show_on_every_day_they_overlap(client: TestClient, ayesha: Headers) -> None:
    event(
        client,
        ayesha,
        title="Overnight hackathon",
        starts_at="2026-11-20T22:00:00Z",
        ends_at="2026-11-21T02:00:00Z",
    )
    event(
        client,
        ayesha,
        title="Ends at midnight",
        starts_at="2026-11-20T22:00:00Z",
        ends_at="2026-11-21T00:00:00Z",
    )
    event(client, ayesha, title="At midnight", starts_at="2026-11-21T00:00:00Z", ends_at=None)

    day_20 = titles(client, ayesha, "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z")
    day_21 = titles(client, ayesha, "2026-11-21T00:00:00Z", "2026-11-22T00:00:00Z")

    assert sorted(day_20) == ["Ends at midnight", "Overnight hackathon"]
    # Half-open: an event ending exactly at 00:00 doesn't spill into the next day, but a
    # point-in-time event at exactly 00:00 belongs to that day.
    assert sorted(day_21) == ["At midnight", "Overnight hackathon"]


def test_multi_day_events_appear_in_a_range_inside_them(
    client: TestClient, ayesha: Headers
) -> None:
    event(
        client,
        ayesha,
        kind="assessment",
        title="Take-home window",
        starts_at="2026-11-16T09:00:00Z",
        ends_at="2026-11-23T09:00:00Z",
    )

    assert titles(client, ayesha, "2026-11-18T00:00:00Z", "2026-11-19T00:00:00Z") == [
        "Take-home window"
    ]
    assert titles(client, ayesha, "2026-11-23T09:00:00Z", "2026-11-24T00:00:00Z") == []


# --------------------------------------------------------------------------- feed: time zones


def test_dst_start_in_chicago(client: TestClient, ayesha: Headers) -> None:
    """14 March 2027 is 23 hours long in Chicago: it starts at -06:00 and ends at -05:00."""
    day = ("2027-03-14T00:00:00-06:00", "2027-03-15T00:00:00-05:00")
    application(client, ayesha, company="Wise", deadline_on="2027-03-14")
    application(client, ayesha, company="Monzo", deadline_on="2027-03-15")
    reminder(client, ayesha, title="All day on the 14th", due_on="2027-03-14")
    # 23:30 CDT on the 14th = 04:30 UTC on the 15th: still the 14th for this user.
    event(client, ayesha, title="Late call", starts_at="2027-03-14T23:30:00-05:00", ends_at=None)
    # 00:30 CDT on the 15th: the next day.
    event(client, ayesha, title="Next day", starts_at="2027-03-15T00:30:00-05:00", ends_at=None)
    # 01:30 CST, just before the clocks jump.
    reminder(client, ayesha, title="Before the jump", due_at="2027-03-14T01:30:00-06:00")

    assert titles(client, ayesha, *day) == [
        "All day on the 14th",
        "Apply to Wise",
        "Before the jump",
        "Late call",
    ]

    month = titles(client, ayesha, "2027-03-01T00:00:00-06:00", "2027-04-01T00:00:00-05:00")
    assert {"Apply to Wise", "Apply to Monzo", "Late call", "Next day"} <= set(month)


def test_dst_end_in_chicago(client: TestClient, ayesha: Headers) -> None:
    """7 November 2027 is 25 hours long: 01:30 happens twice (CDT, then CST)."""
    day = ("2027-11-07T00:00:00-05:00", "2027-11-08T00:00:00-06:00")
    event(client, ayesha, title="First 01:30", starts_at="2027-11-07T01:30:00-05:00", ends_at=None)
    event(client, ayesha, title="Second 01:30", starts_at="2027-11-07T01:30:00-06:00", ends_at=None)
    # 23:30 CST on the 7th = 05:30 UTC on the 8th.
    event(client, ayesha, title="Late call", starts_at="2027-11-07T23:30:00-06:00", ends_at=None)
    reminder(client, ayesha, title="All day on the 7th", due_on="2027-11-07")
    reminder(client, ayesha, title="All day on the 8th", due_on="2027-11-08")

    assert titles(client, ayesha, *day) == [
        "All day on the 7th",
        "First 01:30",
        "Second 01:30",
        "Late call",
    ]


def test_date_only_items_follow_the_clients_calendar_days(
    client: TestClient, ayesha: Headers
) -> None:
    """The same all-day reminder and UTC instant, seen from Karachi (+05:00) and Chicago
    (-06:00). All-day dates never move; timed items land on the local day they occur."""
    reminder(client, ayesha, title="All day 20th", due_on="2026-11-20")
    # 20:00 UTC on the 19th = 01:00 on the 20th in Karachi, 14:00 on the 19th in Chicago.
    reminder(client, ayesha, title="Timed", due_at="2026-11-19T20:00:00Z")

    karachi_20 = titles(client, ayesha, "2026-11-20T00:00:00+05:00", "2026-11-21T00:00:00+05:00")
    chicago_19 = titles(client, ayesha, "2026-11-19T00:00:00-06:00", "2026-11-20T00:00:00-06:00")
    chicago_20 = titles(client, ayesha, "2026-11-20T00:00:00-06:00", "2026-11-21T00:00:00-06:00")

    assert karachi_20 == ["All day 20th", "Timed"]
    assert chicago_19 == ["Timed"]
    assert chicago_20 == ["All day 20th"]


def test_a_range_ending_mid_day_includes_that_day(client: TestClient, ayesha: Headers) -> None:
    reminder(client, ayesha, title="All day 20th", due_on="2026-11-20")

    assert titles(client, ayesha, "2026-11-19T00:00:00Z", "2026-11-20T12:00:00Z") == [
        "All day 20th"
    ]
    assert titles(client, ayesha, "2026-11-19T00:00:00Z", "2026-11-20T00:00:00Z") == []
