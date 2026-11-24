"""Dashboard analytics: cohort by applied_on, stages reached from the timeline."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_header

APPS = "/api/v1/applications"
ANALYTICS = "/api/v1/analytics"
Headers = dict[str, str]


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


def create(client: TestClient, headers: Headers, **fields: Any) -> str:
    payload = {"company": "Careem", "role_title": "Backend Engineer"} | fields
    response = client.post(APPS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    app_id: str = response.json()["id"]
    return app_id


def move(client: TestClient, headers: Headers, app_id: str, *statuses: str) -> None:
    for status in statuses:
        response = client.patch(f"{APPS}/{app_id}", headers=headers, json={"status": status})
        assert response.status_code == 200, response.text


def get(client: TestClient, headers: Headers, endpoint: str, **params: str) -> Any:
    response = client.get(f"{ANALYTICS}/{endpoint}", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def funnel_counts(client: TestClient, headers: Headers, **params: str) -> list[int]:
    return [s["count"] for s in get(client, headers, "funnel", **params)["stages"]]


OCT = {"from": "2026-10-01", "to": "2026-10-31"}


# --------------------------------------------------------------------------- empty


def test_an_empty_account_has_zero_counts_and_null_rates(
    client: TestClient, ayesha: Headers
) -> None:
    assert get(client, ayesha, "summary") == {
        "applied": 0,
        "active": 0,
        "interviewed": 0,
        "offers": 0,
        "interview_rate": None,
        "offer_rate": None,
        "wishlist": 0,
        "by_status": {
            "wishlist": 0,
            "applied": 0,
            "screening": 0,
            "interview": 0,
            "offer": 0,
            "rejected": 0,
            "withdrawn": 0,
        },
    }
    assert get(client, ayesha, "funnel")["stages"] == [
        {"stage": "applied", "count": 0, "rate_from_previous": None},
        {"stage": "screening", "count": 0, "rate_from_previous": None},
        {"stage": "interview", "count": 0, "rate_from_previous": None},
        {"stage": "offer", "count": 0, "rate_from_previous": None},
    ]
    assert get(client, ayesha, "sources") == {"sources": []}
    assert get(client, ayesha, "timeseries") == {"interval": "week", "points": []}


# --------------------------------------------------------------------------- stages


def test_stages_come_from_history_not_the_current_status(
    client: TestClient, ayesha: Headers
) -> None:
    rejected_after_interview = create(client, ayesha, status="applied", applied_on="2026-10-05")
    move(client, ayesha, rejected_after_interview, "screening", "interview", "rejected")
    create(client, ayesha, status="applied", applied_on="2026-10-06")
    offer = create(client, ayesha, status="applied", applied_on="2026-10-07")
    move(client, ayesha, offer, "interview", "offer")

    summary = get(client, ayesha, "summary", **OCT)
    assert summary | {"interview_rate": None, "offer_rate": None, "by_status": None} == {
        "applied": 3,
        "active": 2,  # the rejected one isn't active any more
        "interviewed": 2,
        "offers": 1,
        "interview_rate": None,
        "offer_rate": None,
        "wishlist": 0,
        "by_status": None,
    }
    assert summary["interview_rate"] == pytest.approx(2 / 3)
    assert summary["offer_rate"] == pytest.approx(1 / 3)


def test_the_status_breakdown_counts_the_applied_cohort_by_current_status(
    client: TestClient, ayesha: Headers
) -> None:
    for day, path in [
        ("05", ["interview", "rejected"]),
        ("06", ["rejected"]),
        ("07", ["withdrawn"]),
        ("08", ["screening"]),
    ]:
        move(
            client,
            ayesha,
            create(client, ayesha, status="applied", applied_on=f"2026-10-{day}"),
            *path,
        )
    create(client, ayesha, status="rejected", applied_on="2026-09-30")  # outside the range
    move(client, ayesha, create(client, ayesha, status="wishlist"), "withdrawn")  # never applied

    summary = get(client, ayesha, "summary", **OCT)
    assert summary["by_status"] == {
        "wishlist": 0,
        "applied": 0,
        "screening": 1,
        "interview": 0,
        "offer": 0,
        "rejected": 2,
        "withdrawn": 1,
    }
    assert sum(summary["by_status"].values()) == summary["applied"]


def test_skipped_stages_count_as_reached(client: TestClient, ayesha: Headers) -> None:
    straight_to_interview = create(client, ayesha, status="applied", applied_on="2026-10-05")
    move(client, ayesha, straight_to_interview, "interview")
    create(client, ayesha, status="offer", applied_on="2026-10-06")  # created at Offer

    assert funnel_counts(client, ayesha, **OCT) == [2, 2, 2, 1]


def test_a_reverted_move_still_counts_as_reached(client: TestClient, ayesha: Headers) -> None:
    # Documented trade-off: the history can't tell a mistake from a real step.
    app_id = create(client, ayesha, status="applied", applied_on="2026-10-05")
    move(client, ayesha, app_id, "interview", "applied")

    assert funnel_counts(client, ayesha, **OCT) == [1, 1, 1, 0]
    assert get(client, ayesha, "summary", **OCT)["interviewed"] == 1


def test_wishlist_to_withdrawn_never_counts_as_applied(client: TestClient, ayesha: Headers) -> None:
    # Leaving the wishlist sets applied_on (so it's in the cohort), but it never reached Applied.
    withdrawn = create(client, ayesha, status="wishlist")
    move(client, ayesha, withdrawn, "withdrawn")
    create(client, ayesha, status="applied")

    summary = get(client, ayesha, "summary")
    assert (summary["applied"], summary["active"], summary["interview_rate"]) == (1, 1, 0.0)
    assert funnel_counts(client, ayesha) == [1, 0, 0, 0]
    assert sum(p["count"] for p in get(client, ayesha, "timeseries")["points"]) == 1
    assert [s["applied"] for s in get(client, ayesha, "sources")["sources"]] == [1]


def test_funnel_rates_are_relative_to_the_previous_stage(
    client: TestClient, ayesha: Headers
) -> None:
    for day, path in [
        ("05", ["screening", "interview", "offer"]),
        ("06", ["screening", "interview"]),
        ("07", ["screening"]),
        ("08", []),
    ]:
        move(
            client,
            ayesha,
            create(client, ayesha, status="applied", applied_on=f"2026-10-{day}"),
            *path,
        )

    stages = get(client, ayesha, "funnel", **OCT)["stages"]
    assert [s["count"] for s in stages] == [4, 3, 2, 1]
    assert [s["rate_from_previous"] for s in stages] == [
        None,
        pytest.approx(3 / 4),
        pytest.approx(2 / 3),
        pytest.approx(1 / 2),
    ]


# --------------------------------------------------------------------------- cohort


def test_the_range_selects_a_cohort_by_applied_on_but_wishlist_ignores_it(
    client: TestClient, ayesha: Headers
) -> None:
    create(client, ayesha, status="applied", applied_on="2026-09-30")  # before the range
    create(client, ayesha, status="applied", applied_on="2026-10-01")  # first day: in
    create(client, ayesha, status="applied", applied_on="2026-10-31")  # last day: in
    create(client, ayesha, status="applied", applied_on="2026-11-01")  # after
    create(client, ayesha, status="wishlist")
    create(client, ayesha, status="wishlist")

    summary = get(client, ayesha, "summary", **OCT)
    assert (summary["applied"], summary["wishlist"]) == (2, 2)
    assert get(client, ayesha, "summary")["applied"] == 4  # no range: every dated application


def test_other_users_applications_are_never_counted(
    client: TestClient, ayesha: Headers, register: Callable[..., dict[str, Any]]
) -> None:
    bilal = auth_header(register(email="bilal.ahmed@mailbox-ok.com")["access_token"])
    create(client, bilal, status="offer", applied_on="2026-10-05", source="Referral")

    assert get(client, ayesha, "summary", **OCT)["applied"] == 0
    assert get(client, ayesha, "sources", **OCT) == {"sources": []}


def test_an_inverted_range_is_rejected_on_the_to_field(client: TestClient, ayesha: Headers) -> None:
    response = client.get(
        f"{ANALYTICS}/summary", headers=ayesha, params={"from": "2026-10-31", "to": "2026-10-01"}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "to"


def test_analytics_require_authentication(client: TestClient) -> None:
    for endpoint in ("summary", "funnel", "sources", "timeseries"):
        assert client.get(f"{ANALYTICS}/{endpoint}").status_code == 401


# --------------------------------------------------------------------------- sources


def test_sources_group_case_insensitively_under_the_most_common_spelling(
    client: TestClient, ayesha: Headers
) -> None:
    for source, path in [
        ("LinkedIn", ["interview"]),
        ("linkedin", []),
        (" LinkedIn ", []),
        ("Referral", ["interview"]),
        (None, []),
    ]:
        app_id = create(client, ayesha, status="applied", applied_on="2026-10-05", source=source)
        move(client, ayesha, app_id, *path)

    assert get(client, ayesha, "sources", **OCT)["sources"] == [
        {
            "source": "LinkedIn",
            "applied": 3,
            "interviewed": 1,
            "interview_rate": pytest.approx(1 / 3),
        },
        {"source": "Referral", "applied": 1, "interviewed": 1, "interview_rate": 1.0},
        {"source": None, "applied": 1, "interviewed": 0, "interview_rate": 0.0},
    ]


# --------------------------------------------------------------------------- timeseries


def test_weekly_buckets_start_on_monday_and_are_zero_filled(
    client: TestClient, ayesha: Headers
) -> None:
    create(client, ayesha, status="applied", applied_on="2026-10-05")  # a Monday
    create(client, ayesha, status="applied", applied_on="2026-10-11")  # Sunday, same week
    create(client, ayesha, status="applied", applied_on="2026-10-21")  # Wednesday

    series = get(client, ayesha, "timeseries", **OCT)
    assert series == {
        "interval": "week",
        "points": [
            {"start": "2026-09-28", "count": 0},  # the week holding 1 Oct
            {"start": "2026-10-05", "count": 2},
            {"start": "2026-10-12", "count": 0},
            {"start": "2026-10-19", "count": 1},
            {"start": "2026-10-26", "count": 0},  # the week holding 31 Oct
        ],
    }


def test_long_ranges_use_monthly_buckets(client: TestClient, ayesha: Headers) -> None:
    create(client, ayesha, status="applied", applied_on="2026-02-14")
    create(client, ayesha, status="applied", applied_on="2026-11-02")

    series = get(client, ayesha, "timeseries", **{"from": "2026-01-01", "to": "2026-11-30"})
    assert series["interval"] == "month"
    assert [p["start"] for p in series["points"]] == [f"2026-{m:02d}-01" for m in range(1, 12)]
    assert [p["count"] for p in series["points"]] == [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]


def test_26_weeks_is_still_weekly(client: TestClient, ayesha: Headers) -> None:
    series = get(client, ayesha, "timeseries", **{"from": "2026-05-04", "to": "2026-11-02"})
    assert series["interval"] == "week"  # exactly 182 days
    assert len(series["points"]) == 27
    assert {p["count"] for p in series["points"]} == {0}


def test_an_open_range_follows_the_data(client: TestClient, ayesha: Headers) -> None:
    create(client, ayesha, status="applied", applied_on="2026-10-07")
    create(client, ayesha, status="applied", applied_on="2026-10-20")

    points = get(client, ayesha, "timeseries")["points"]
    assert [p["start"] for p in points] == ["2026-10-05", "2026-10-12", "2026-10-19"]
