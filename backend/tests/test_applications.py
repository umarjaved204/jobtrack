import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ApplicationEvent, ResumeVersion
from tests.conftest import auth_header

APPS = "/api/v1/applications"
Headers = dict[str, str]
Register = Callable[..., dict[str, Any]]


@pytest.fixture
def ayesha(register: Register) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Register) -> Headers:
    return auth_header(
        register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")["access_token"]
    )


def create(client: TestClient, headers: Headers, **fields: Any) -> dict[str, Any]:
    payload = {"company": "Careem", "role_title": "Backend Engineer"} | fields
    response = client.post(APPS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def create_tag(client: TestClient, headers: Headers, name: str, color: str = "cobalt") -> str:
    response = client.post("/api/v1/tags", headers=headers, json={"name": name, "color": color})
    assert response.status_code == 201, response.text
    tag_id: str = response.json()["id"]
    return tag_id


def board_column(client: TestClient, headers: Headers, status: str) -> list[dict[str, Any]]:
    board = client.get(f"{APPS}/board", headers=headers).json()
    column: list[dict[str, Any]] = next(
        c["applications"] for c in board["columns"] if c["status"] == status
    )
    return column


def events(client: TestClient, headers: Headers, app_id: str) -> list[dict[str, Any]]:
    response = client.get(f"{APPS}/{app_id}/events", headers=headers)
    assert response.status_code == 200
    body: list[dict[str, Any]] = response.json()
    return body


TODAY = datetime.now(UTC).date().isoformat()


# --------------------------------------------------------------------------- create


def test_create_with_minimal_fields_uses_sensible_defaults(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, company="  Arbisoft ", role_title="Python Developer")

    assert app["company"] == "Arbisoft"  # trimmed
    assert app["status"] == "wishlist"
    assert app["position"] == 1024.0
    assert app["applied_on"] is None  # still on the wishlist
    assert app["tags"] == []


def test_create_normalises_and_stores_all_fields(client: TestClient, ayesha: Headers) -> None:
    app = create(
        client,
        ayesha,
        company="Systems Limited",
        role_title="Machine Learning Engineer",
        location="Lahore, Pakistan",
        work_mode="hybrid",
        job_url="https://careers.systemsltd.com/jobs/ml-engineer-4512",
        salary_min=350_000,
        salary_max=500_000,
        salary_currency="pkr",
        source="LinkedIn",
        status="applied",
        applied_on="2026-11-03",
        deadline_on="2026-11-30",
    )

    assert app["salary_currency"] == "PKR"
    assert app["job_url"] == "https://careers.systemsltd.com/jobs/ml-engineer-4512"
    assert app["applied_on"] == "2026-11-03"  # explicit date kept
    assert app["work_mode"] == "hybrid"


def test_leaving_the_wishlist_defaults_applied_on_to_today(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, status="screening")

    assert app["applied_on"] == TODAY


def test_create_starts_the_timeline_with_the_initial_status(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, status="applied")

    [event] = events(client, ayesha, app["id"])
    assert event["type"] == "status_change"
    assert event["from_status"] is None
    assert event["to_status"] == "applied"


@pytest.mark.parametrize(
    ("fields", "reason"),
    [
        ({"company": "   "}, "blank company"),
        ({"salary_min": 900_000, "salary_max": 600_000}, "inverted salary range"),
        ({"salary_min": -1}, "negative salary"),
        ({"salary_currency": "rupees"}, "not an ISO currency"),
        ({"job_url": "careers page"}, "not a URL"),
        ({"job_url": "ftp://example.com/job"}, "not http(s)"),
        ({"status": "ghosted"}, "unknown status"),
        ({"work_mode": "office"}, "unknown work mode"),
        ({"user_id": str(uuid.uuid4())}, "unknown field (can't set the owner)"),
    ],
)
def test_create_rejects_invalid_input(
    client: TestClient, ayesha: Headers, fields: dict[str, Any], reason: str
) -> None:
    payload = {"company": "Careem", "role_title": "Backend Engineer"} | fields

    response = client.post(APPS, headers=ayesha, json=payload)

    assert response.status_code == 422, reason


def test_create_rejects_tags_and_resumes_the_user_does_not_own(
    client: TestClient, db: Session, ayesha: Headers, bilal: Headers
) -> None:
    bilals_tag = create_tag(client, bilal, "Dream job")
    bilals_user_id = client.get("/api/v1/users/me", headers=bilal).json()["id"]
    bilals_resume = ResumeVersion(
        user_id=uuid.UUID(bilals_user_id), label="General", content_text="Python, SQL"
    )
    db.add(bilals_resume)
    db.commit()

    other_tag = client.post(
        APPS,
        headers=ayesha,
        json={"company": "Careem", "role_title": "SWE", "tag_ids": [bilals_tag]},
    )
    other_resume = client.post(
        APPS,
        headers=ayesha,
        json={"company": "Careem", "role_title": "SWE", "resume_version_id": str(bilals_resume.id)},
    )

    assert other_tag.status_code == 422
    assert other_tag.json() == {"detail": "One or more tags do not exist"}
    assert other_resume.status_code == 422
    assert other_resume.json() == {"detail": "Resume version does not exist"}


def test_requires_authentication(client: TestClient) -> None:
    assert client.get(APPS).status_code == 401
    assert client.post(APPS, json={"company": "Careem", "role_title": "SWE"}).status_code == 401


# --------------------------------------------------------------------------- ownership


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("GET", "", None),
        ("PATCH", "", {"role_title": "Hijacked"}),
        ("DELETE", "", None),
        ("POST", "/move", {"status": "offer", "position": 1.0}),
        ("GET", "/events", None),
        ("POST", "/events", {"body": "Sneaky note"}),
    ],
)
def test_another_users_application_is_not_found(
    client: TestClient,
    ayesha: Headers,
    bilal: Headers,
    method: str,
    suffix: str,
    body: dict[str, Any] | None,
) -> None:
    app_id = create(client, ayesha)["id"]

    response = client.request(method, f"{APPS}/{app_id}{suffix}", headers=bilal, json=body)

    assert response.status_code == 404
    assert response.json() == {"detail": "Application not found"}
    # ...and Ayesha's application is untouched.
    assert client.get(f"{APPS}/{app_id}", headers=ayesha).json()["role_title"] == "Backend Engineer"


def test_unknown_id_is_not_found(client: TestClient, ayesha: Headers) -> None:
    assert client.get(f"{APPS}/{uuid.uuid4()}", headers=ayesha).status_code == 404


# --------------------------------------------------------------------------- update / delete


def test_patch_changes_only_sent_fields_and_null_clears_optionals(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, location="Karachi", source="Referral")

    response = client.patch(
        f"{APPS}/{app['id']}",
        headers=ayesha,
        json={"role_title": "Senior Backend Engineer", "location": None},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["role_title"] == "Senior Backend Engineer"
    assert updated["location"] is None
    assert updated["source"] == "Referral"  # untouched


@pytest.mark.parametrize("field", ["company", "role_title", "status", "tag_ids"])
def test_patch_cannot_null_required_fields(client: TestClient, ayesha: Headers, field: str) -> None:
    app = create(client, ayesha)

    response = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={field: None})

    assert response.status_code == 422


def test_patch_checks_salary_range_against_stored_values(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, salary_min=400_000)

    response = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={"salary_max": 300_000})

    assert response.status_code == 422
    assert response.json() == {"detail": "salary_min must not be greater than salary_max"}


def test_patch_status_logs_history_and_moves_card_to_end_of_column(
    client: TestClient, ayesha: Headers
) -> None:
    create(client, ayesha, company="Stripe", status="interview")
    app = create(client, ayesha, company="Careem", status="applied")

    updated = client.patch(
        f"{APPS}/{app['id']}", headers=ayesha, json={"status": "interview"}
    ).json()

    assert updated["status"] == "interview"
    assert updated["position"] == 2048.0  # after Stripe
    latest = events(client, ayesha, app["id"])[0]
    assert (latest["from_status"], latest["to_status"]) == ("applied", "interview")


def test_patch_tag_ids_replaces_the_set(client: TestClient, ayesha: Headers) -> None:
    remote = create_tag(client, ayesha, "Remote")
    referral = create_tag(client, ayesha, "Referral")
    app = create(client, ayesha, tag_ids=[remote])

    replaced = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={"tag_ids": [referral]})
    cleared = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={"tag_ids": []})

    assert [t["name"] for t in replaced.json()["tags"]] == ["Referral"]
    assert cleared.json()["tags"] == []


def test_delete_removes_application_and_its_timeline(
    client: TestClient, db: Session, ayesha: Headers
) -> None:
    app = create(client, ayesha, status="applied")
    client.post(f"{APPS}/{app['id']}/events", headers=ayesha, json={"body": "Sent follow-up"})

    response = client.delete(f"{APPS}/{app['id']}", headers=ayesha)

    assert response.status_code == 204
    assert client.get(f"{APPS}/{app['id']}", headers=ayesha).status_code == 404
    assert db.scalar(select(func.count()).select_from(ApplicationEvent)) == 0


# --------------------------------------------------------------------------- kanban


def test_new_cards_are_appended_to_the_end_of_their_column(
    client: TestClient, ayesha: Headers
) -> None:
    first = create(client, ayesha, company="Careem")
    second = create(client, ayesha, company="Arbisoft")
    other_column = create(client, ayesha, company="Stripe", status="applied")

    assert (first["position"], second["position"]) == (1024.0, 2048.0)
    assert other_column["position"] == 1024.0


def test_move_to_another_column_logs_a_status_change(client: TestClient, ayesha: Headers) -> None:
    a = create(client, ayesha, company="Careem", status="interview")
    b = create(client, ayesha, company="Stripe", status="interview")
    moving = create(client, ayesha, company="Arbisoft", status="applied")

    # Dropped between Careem (1024) and Stripe (2048).
    response = client.post(
        f"{APPS}/{moving['id']}/move",
        headers=ayesha,
        json={"status": "interview", "position": 1536},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "interview"
    assert [c["id"] for c in board_column(client, ayesha, "interview")] == [
        a["id"],
        moving["id"],
        b["id"],
    ]
    latest = events(client, ayesha, moving["id"])[0]
    assert (latest["from_status"], latest["to_status"]) == ("applied", "interview")


def test_reordering_within_a_column_logs_nothing(client: TestClient, ayesha: Headers) -> None:
    create(client, ayesha, company="Careem")
    app = create(client, ayesha, company="Stripe")

    client.post(
        f"{APPS}/{app['id']}/move", headers=ayesha, json={"status": "wishlist", "position": 512}
    )

    assert len(events(client, ayesha, app["id"])) == 1  # only the creation event
    assert board_column(client, ayesha, "wishlist")[0]["id"] == app["id"]


def test_column_is_respaced_when_positions_get_too_close(
    client: TestClient, ayesha: Headers
) -> None:
    a = create(client, ayesha, company="Careem")
    b = create(client, ayesha, company="Stripe")
    c = create(client, ayesha, company="Arbisoft")

    # Many drops into the same gap eventually leave neighbours ~1e-7 apart.
    client.post(
        f"{APPS}/{c['id']}/move",
        headers=ayesha,
        json={"status": "wishlist", "position": a["position"] + 1e-7},
    )

    column = board_column(client, ayesha, "wishlist")
    assert [card["id"] for card in column] == [a["id"], c["id"], b["id"]]  # order kept
    assert [card["position"] for card in column] == [1024.0, 2048.0, 3072.0]  # evenly re-spaced


def test_dropping_onto_an_identical_position_places_the_card_first(
    client: TestClient, ayesha: Headers
) -> None:
    a = create(client, ayesha, company="Careem")
    b = create(client, ayesha, company="Stripe")

    client.post(
        f"{APPS}/{b['id']}/move",
        headers=ayesha,
        json={"status": "wishlist", "position": a["position"]},
    )

    assert [card["id"] for card in board_column(client, ayesha, "wishlist")] == [b["id"], a["id"]]


def test_move_rejects_non_finite_positions(client: TestClient, ayesha: Headers) -> None:
    app = create(client, ayesha)

    response = client.post(
        f"{APPS}/{app['id']}/move",
        headers=ayesha,
        content='{"status": "applied", "position": NaN}',
    )

    assert response.status_code == 422


def test_board_has_all_seven_columns_with_only_my_cards(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    create(client, ayesha, company="Careem", status="offer")
    create(client, bilal, company="Not Ayesha's", status="offer")

    board = client.get(f"{APPS}/board", headers=ayesha).json()

    assert [c["status"] for c in board["columns"]] == [
        "wishlist",
        "applied",
        "screening",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
    ]
    offers = next(c for c in board["columns"] if c["status"] == "offer")["applications"]
    assert [a["company"] for a in offers] == ["Careem"]


# --------------------------------------------------------------------------- list / search


@pytest.fixture
def pipeline(client: TestClient, ayesha: Headers, bilal: Headers) -> dict[str, str]:
    """A realistic spread of applications for Ayesha (plus one of Bilal's as a decoy)."""
    remote = create_tag(client, ayesha, "Remote")
    referral = create_tag(client, ayesha, "Referral")
    rows = [
        ("Careem", "Backend Engineer", "applied", "LinkedIn", "2026-10-05", [remote]),
        (
            "Stripe",
            "Software Engineer, Payments",
            "interview",
            "Company site",
            "2026-10-20",
            [remote],
        ),
        ("Arbisoft", "Python Developer", "rejected", "Referral", "2026-09-12", [referral]),
        ("Systems Limited", "Machine Learning Engineer", "offer", "linkedin", "2026-11-01", []),
        ("Shopify", "Data Engineer", "wishlist", None, None, []),
    ]
    ids = {}
    for company, role, status, source, applied_on, tags in rows:
        ids[company] = create(
            client,
            ayesha,
            company=company,
            role_title=role,
            status=status,
            source=source,
            applied_on=applied_on,
            tag_ids=tags,
        )["id"]
    create(client, bilal, company="Careem", role_title="Backend Engineer", status="applied")
    return ids | {"tag:Remote": remote, "tag:Referral": referral}


def list_companies(client: TestClient, headers: Headers, **params: Any) -> list[str]:
    response = client.get(APPS, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return [item["company"] for item in response.json()["items"]]


def test_list_only_returns_my_applications(
    client: TestClient, ayesha: Headers, pipeline: dict[str, str]
) -> None:
    body = client.get(APPS, headers=ayesha).json()

    assert body["total"] == 5
    assert sorted(i["company"] for i in body["items"]) == [
        "Arbisoft",
        "Careem",
        "Shopify",
        "Stripe",
        "Systems Limited",
    ]


@pytest.mark.parametrize(
    ("q", "expected"),
    [
        ("careem", ["Careem"]),  # case-insensitive
        ("engineer", ["Careem", "Shopify", "Stripe", "Systems Limited"]),  # role title
        ("Payments", ["Stripe"]),  # substring of role
        ("Strpe", ["Stripe"]),  # typo: trigram similarity
        ("%", []),  # LIKE wildcards are literal, not "match everything"
        ("_", []),
    ],
)
def test_search(
    client: TestClient, ayesha: Headers, pipeline: dict[str, str], q: str, expected: list[str]
) -> None:
    assert sorted(list_companies(client, ayesha, q=q)) == expected


def test_filters_combine(client: TestClient, ayesha: Headers, pipeline: dict[str, str]) -> None:
    assert sorted(list_companies(client, ayesha, status=["applied", "offer"])) == [
        "Careem",
        "Systems Limited",
    ]
    assert sorted(list_companies(client, ayesha, source="LINKEDIN")) == [
        "Careem",
        "Systems Limited",
    ]
    assert sorted(list_companies(client, ayesha, tag=pipeline["tag:Remote"])) == [
        "Careem",
        "Stripe",
    ]
    assert sorted(
        list_companies(client, ayesha, tag=[pipeline["tag:Remote"], pipeline["tag:Referral"]])
    ) == ["Arbisoft", "Careem", "Stripe"]
    assert sorted(list_companies(client, ayesha, **{"from": "2026-10-01", "to": "2026-10-31"})) == [
        "Careem",
        "Stripe",
    ]
    assert list_companies(client, ayesha, q="engineer", status="offer", source="linkedin") == [
        "Systems Limited"
    ]


def test_sorting(client: TestClient, ayesha: Headers, pipeline: dict[str, str]) -> None:
    assert list_companies(client, ayesha, sort="company") == [
        "Arbisoft",
        "Careem",
        "Shopify",
        "Stripe",
        "Systems Limited",
    ]
    # Most recent first, applications without a date last.
    assert list_companies(client, ayesha, sort="-applied_on") == [
        "Systems Limited",
        "Stripe",
        "Careem",
        "Arbisoft",
        "Shopify",
    ]


def test_pagination(client: TestClient, ayesha: Headers) -> None:
    for i in range(23):
        create(client, ayesha, company=f"Company {i:02d}")

    last_page = client.get(
        APPS, headers=ayesha, params={"page": 3, "page_size": 10, "sort": "company"}
    ).json()
    beyond = client.get(APPS, headers=ayesha, params={"page": 4, "page_size": 10}).json()

    assert (last_page["total"], last_page["pages"], last_page["page"]) == (23, 3, 3)
    assert [i["company"] for i in last_page["items"]] == [
        "Company 20",
        "Company 21",
        "Company 22",
    ]
    assert beyond["items"] == []


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page_size": 101},
        {"status": "ghosted"},
        {"sort": "salary"},
        {"from": "last week"},
        {"tag": "not-a-uuid"},
        {"q": "x" * 101},
    ],
)
def test_list_rejects_invalid_params(
    client: TestClient, ayesha: Headers, params: dict[str, Any]
) -> None:
    assert client.get(APPS, headers=ayesha, params=params).status_code == 422


# --------------------------------------------------------------------------- timeline


def test_notes_and_status_changes_form_a_newest_first_timeline(
    client: TestClient, ayesha: Headers
) -> None:
    app = create(client, ayesha, status="applied")
    note = client.post(
        f"{APPS}/{app['id']}/events",
        headers=ayesha,
        json={"body": "  Recruiter call booked for Thursday 3pm  "},
    )
    client.post(
        f"{APPS}/{app['id']}/move", headers=ayesha, json={"status": "screening", "position": 1024}
    )

    assert note.status_code == 201
    assert note.json()["body"] == "Recruiter call booked for Thursday 3pm"
    timeline = events(client, ayesha, app["id"])
    assert [(e["type"], e["to_status"]) for e in timeline] == [
        ("status_change", "screening"),
        ("note", None),
        ("status_change", "applied"),
    ]


def test_blank_notes_are_rejected(client: TestClient, ayesha: Headers) -> None:
    app = create(client, ayesha)

    response = client.post(f"{APPS}/{app['id']}/events", headers=ayesha, json={"body": "   "})

    assert response.status_code == 422


def test_applied_on_is_not_overwritten_by_later_moves(client: TestClient, ayesha: Headers) -> None:
    app = create(client, ayesha, status="applied", applied_on="2026-10-01")

    moved = client.post(
        f"{APPS}/{app['id']}/move", headers=ayesha, json={"status": "interview", "position": 1024}
    ).json()

    assert moved["applied_on"] == "2026-10-01"
    assert date.fromisoformat(moved["applied_on"]) < date.fromisoformat(TODAY)


def test_resume_version_can_be_linked_only_if_owned(
    client: TestClient, db: Session, ayesha: Headers, bilal: Headers
) -> None:
    def resume_for(headers: Headers, label: str) -> str:
        user_id = uuid.UUID(client.get("/api/v1/users/me", headers=headers).json()["id"])
        resume = ResumeVersion(user_id=user_id, label=label, content_text="Python, FastAPI, SQL")
        db.add(resume)
        db.commit()
        return str(resume.id)

    mine = resume_for(ayesha, "Backend v3")
    theirs = resume_for(bilal, "Data v1")
    app = create(client, ayesha, resume_version_id=mine)

    hijack = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={"resume_version_id": theirs})
    unlink = client.patch(f"{APPS}/{app['id']}", headers=ayesha, json={"resume_version_id": None})

    assert app["resume_version_id"] == mine
    assert hijack.status_code == 422
    assert unlink.json()["resume_version_id"] is None


def test_job_url_longer_than_the_column_is_rejected(client: TestClient, ayesha: Headers) -> None:
    too_long = "https://careers.example.com/" + "a" * 2030

    response = client.post(
        APPS, headers=ayesha, json={"company": "Careem", "role_title": "SWE", "job_url": too_long}
    )

    assert response.status_code == 422
    assert "2048" in response.text
