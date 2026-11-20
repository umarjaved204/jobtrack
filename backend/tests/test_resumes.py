import threading
import uuid
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import MatchResult, ResumeVersion, User
from app.schemas.resume import ResumeUpdate
from app.services import resumes as service
from tests.conftest import auth_header

RESUMES = "/api/v1/resumes"
APPS = "/api/v1/applications"
Headers = dict[str, str]

BACKEND_CV = "Ayesha Khan\nBackend engineer\n\nPython, FastAPI, PostgreSQL, Docker"


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


def create(client: TestClient, headers: Headers, **fields: Any) -> dict[str, Any]:
    payload = {"label": "Backend v1", "content_text": BACKEND_CV} | fields
    response = client.post(RESUMES, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def patch(client: TestClient, headers: Headers, resume_id: str, **fields: Any) -> Any:
    return client.patch(f"{RESUMES}/{resume_id}", headers=headers, json=fields)


def send_with_application(client: TestClient, headers: Headers, resume_id: str) -> str:
    response = client.post(
        APPS,
        headers=headers,
        json={
            "company": "Careem",
            "role_title": "Backend Engineer",
            "resume_version_id": resume_id,
        },
    )
    assert response.status_code == 201, response.text
    app_id: str = response.json()["id"]
    return app_id


def defaults(client: TestClient, headers: Headers) -> list[str]:
    return [r["label"] for r in client.get(RESUMES, headers=headers).json() if r["is_default"]]


# --------------------------------------------------------------------------- CRUD


def test_create_read_list_update_delete(client: TestClient, ayesha: Headers) -> None:
    created = create(client, ayesha, label="  Backend v1 ")
    create(client, ayesha, label="Data v1", content_text="SQL, dbt, Airflow")

    assert created["label"] == "Backend v1"
    assert created["content_text"] == BACKEND_CV
    assert created["char_count"] == len(BACKEND_CV)
    assert (created["application_count"], created["match_count"]) == (0, 0)
    assert created["is_default"] is False and created["archived_at"] is None

    listed = client.get(RESUMES, headers=ayesha).json()
    # Both share one transaction (so one now()): order is covered by the default/archive tests.
    assert sorted(r["label"] for r in listed) == ["Backend v1", "Data v1"]
    assert "content_text" not in listed[0]  # the list stays light

    rid = created["id"]
    assert client.get(f"{RESUMES}/{rid}", headers=ayesha).json() == created
    edited = patch(client, ayesha, rid, label="Backend v2", content_text="Python, Go")
    assert (edited.json()["label"], edited.json()["content_text"]) == ("Backend v2", "Python, Go")

    assert client.delete(f"{RESUMES}/{rid}", headers=ayesha).status_code == 204
    assert client.get(f"{RESUMES}/{rid}", headers=ayesha).status_code == 404


def test_text_is_normalised_and_limited(client: TestClient, ayesha: Headers) -> None:
    pasted = "\r\n  Ayesha Khan\r\nBackend engineer\rPython\x00 \n\n"
    created = create(client, ayesha, content_text=pasted)
    assert created["content_text"] == "Ayesha Khan\nBackend engineer\nPython"

    at_limit = client.post(
        RESUMES, headers=ayesha, json={"label": "Long", "content_text": "a" * 50_000}
    )
    # CRLF counts as one character, so the limit means the same thing on every OS.
    crlf = client.post(
        RESUMES, headers=ayesha, json={"label": "CRLF", "content_text": "ab\r\n" * 16_666}
    )
    over = client.post(
        RESUMES, headers=ayesha, json={"label": "Long", "content_text": "a" * 50_001}
    )
    blank = client.post(RESUMES, headers=ayesha, json={"label": "Blank", "content_text": " \r\n "})

    assert at_limit.status_code == 201
    assert crlf.status_code == 201
    assert over.status_code == 422
    assert blank.status_code == 422


def test_resumes_are_private(client: TestClient, ayesha: Headers, bilal: Headers) -> None:
    rid = create(client, ayesha)["id"]

    assert client.get(RESUMES, headers=bilal).json() == []
    assert client.get(f"{RESUMES}/{rid}", headers=bilal).status_code == 404
    assert patch(client, bilal, rid, label="Mine now").status_code == 404
    assert patch(client, bilal, rid, is_default=True).status_code == 404
    assert client.delete(f"{RESUMES}/{rid}", headers=bilal).status_code == 404


def test_rejects_nulls_and_unknown_fields(client: TestClient, ayesha: Headers) -> None:
    rid = create(client, ayesha)["id"]

    assert patch(client, ayesha, rid, label=None).status_code == 422
    assert patch(client, ayesha, rid, is_default=None).status_code == 422
    assert patch(client, ayesha, rid, user_id=str(uuid.uuid4())).status_code == 422
    assert patch(client, ayesha, rid, archived=True, is_default=True).status_code == 422


# --------------------------------------------------------------------------- default


def test_one_default_per_user(client: TestClient, ayesha: Headers, bilal: Headers) -> None:
    first = create(client, ayesha, label="Backend v1", is_default=True)
    second = create(client, ayesha, label="Backend v2")
    create(client, bilal, label="Data v1", is_default=True)

    assert defaults(client, ayesha) == ["Backend v1"]
    assert patch(client, ayesha, second["id"], is_default=True).json()["is_default"] is True
    assert defaults(client, ayesha) == ["Backend v2"]
    assert client.get(RESUMES, headers=ayesha).json()[0]["label"] == "Backend v2"  # default first

    create(client, ayesha, label="Backend v3", is_default=True)
    assert defaults(client, ayesha) == ["Backend v3"]
    assert defaults(client, bilal) == ["Data v1"]  # untouched

    patch(client, ayesha, first["id"], is_default=False)  # wasn't the default: no-op
    assert defaults(client, ayesha) == ["Backend v3"]


def test_default_can_be_cleared(client: TestClient, ayesha: Headers) -> None:
    rid = create(client, ayesha, is_default=True)["id"]

    assert patch(client, ayesha, rid, is_default=False).json()["is_default"] is False
    assert defaults(client, ayesha) == []


# --------------------------------------------------------------------------- archive


def test_archiving_hides_from_default_and_can_be_undone(
    client: TestClient, ayesha: Headers
) -> None:
    rid = create(client, ayesha, label="Backend v1", is_default=True)["id"]
    create(client, ayesha, label="Backend v2")

    archived = patch(client, ayesha, rid, archived=True).json()
    assert archived["archived_at"] is not None
    assert archived["is_default"] is False  # archiving the default unsets it
    assert [r["label"] for r in client.get(RESUMES, headers=ayesha).json()] == [
        "Backend v2",
        "Backend v1",  # archived last
    ]

    as_default = patch(client, ayesha, rid, is_default=True)
    assert as_default.status_code == 409
    assert as_default.json() == {"detail": "An archived resume can't be the default"}

    restored = patch(client, ayesha, rid, archived=False).json()
    assert restored["archived_at"] is None
    assert patch(client, ayesha, rid, is_default=True).json()["is_default"] is True


def test_archived_and_default_is_impossible_in_the_database(db: Session, ayesha: Headers) -> None:
    user = db.scalars(select(User)).one()
    db.add(
        ResumeVersion(
            user_id=user.id,
            label="Backend v1",
            content_text=BACKEND_CV,
            is_default=True,
            archived_at=user.created_at,
        )
    )
    with pytest.raises(IntegrityError, match="archived_not_default"):
        db.flush()
    db.rollback()


def test_archived_versions_cannot_be_newly_linked(client: TestClient, ayesha: Headers) -> None:
    sent = create(client, ayesha, label="Backend v1")["id"]
    app_id = send_with_application(client, ayesha, sent)
    patch(client, ayesha, sent, archived=True)
    other_app = client.post(
        APPS, headers=ayesha, json={"company": "Wise", "role_title": "Engineer"}
    ).json()["id"]

    new_link = client.patch(f"{APPS}/{other_app}", headers=ayesha, json={"resume_version_id": sent})
    on_create = client.post(
        APPS,
        headers=ayesha,
        json={"company": "Monzo", "role_title": "Engineer", "resume_version_id": sent},
    )
    # The application that already used it keeps it, even when the form resends the value.
    kept = client.patch(
        f"{APPS}/{app_id}", headers=ayesha, json={"resume_version_id": sent, "location": "Remote"}
    )

    assert new_link.status_code == 422
    assert new_link.json() == {"detail": "Resume version is archived"}
    assert on_create.status_code == 422
    assert kept.status_code == 200
    assert kept.json()["resume_version_id"] == sent


# --------------------------------------------------------------------------- in use


def test_used_versions_freeze_their_text_and_cannot_be_deleted(
    client: TestClient, ayesha: Headers
) -> None:
    rid = create(client, ayesha)["id"]
    send_with_application(client, ayesha, rid)
    send_with_application(client, ayesha, rid)

    read = client.get(f"{RESUMES}/{rid}", headers=ayesha).json()
    assert read["application_count"] == 2

    rewrite = patch(client, ayesha, rid, content_text="Something else entirely")
    same_text = patch(client, ayesha, rid, content_text=BACKEND_CV + "\r\n", label="Backend (sent)")
    deleted = client.delete(f"{RESUMES}/{rid}", headers=ayesha)

    assert rewrite.status_code == 409
    assert rewrite.json()["detail"].startswith("This version has been used")
    assert same_text.status_code == 200  # unchanged text is fine; the label can change
    assert same_text.json()["label"] == "Backend (sent)"
    assert deleted.status_code == 409
    assert deleted.json()["detail"].endswith("Archive it instead.")
    assert client.get(f"{RESUMES}/{rid}", headers=ayesha).status_code == 200


def _add_match(db: Session, resume_id: str) -> None:
    resume = db.get(ResumeVersion, uuid.UUID(resume_id))
    assert resume is not None
    db.add(
        MatchResult(
            user_id=resume.user_id,
            resume_version_id=resume.id,
            jd_text="Senior Python engineer: FastAPI, PostgreSQL, AWS",
            score=72,
            matched_skills=[{"skills": ["Python"], "label": "Python", "required": True}],
            missing_skills=[{"skills": ["AWS"], "label": "AWS", "required": True}],
            suggested_keywords=["AWS"],
            evidence=[],
            sections_detected=False,
            skill_coverage=0.75,
            semantic_score=0.68,
            model_name="test-model",
            scoring_version=1,
            calibration_version=1,
            taxonomy_version=1,
        )
    )
    db.commit()


def test_match_results_count_as_use(client: TestClient, db: Session, ayesha: Headers) -> None:
    rid = create(client, ayesha)["id"]
    _add_match(db, rid)

    assert client.get(f"{RESUMES}/{rid}", headers=ayesha).json()["match_count"] == 1
    assert patch(client, ayesha, rid, content_text="New text").status_code == 409
    assert client.delete(f"{RESUMES}/{rid}", headers=ayesha).status_code == 409


def test_the_database_refuses_to_delete_match_history(
    client: TestClient, db: Session, ayesha: Headers
) -> None:
    """Backstop for the service rule: no ON DELETE CASCADE from resumes to match results."""
    rid = create(client, ayesha)["id"]
    _add_match(db, rid)

    with pytest.raises(IntegrityError, match="match_results"):
        db.execute(delete(ResumeVersion).where(ResumeVersion.id == uuid.UUID(rid)))
    db.rollback()


def test_deleting_the_account_still_removes_resumes_and_matches(
    client: TestClient, db: Session, ayesha: Headers
) -> None:
    rid = create(client, ayesha)["id"]
    _add_match(db, rid)

    assert client.delete("/api/v1/users/me", headers=ayesha).status_code == 204
    assert db.scalar(select(ResumeVersion.id)) is None
    assert db.scalar(select(MatchResult.id)) is None


# --------------------------------------------------------------------------- concurrency


@pytest.fixture
def committed_user(engine: Engine) -> Iterator[tuple[uuid.UUID, list[uuid.UUID]]]:
    """A user with three resumes, committed for real (outside the per-test transaction) so
    that separate connections can race on them. Removed afterwards."""
    with Session(engine) as session:
        user = User(
            email=f"race-{uuid.uuid4().hex[:8]}@mailbox-ok.com",
            password_hash="not-a-real-hash",
            full_name="Race Test",
        )
        session.add(user)
        session.flush()
        resumes = [
            ResumeVersion(
                user_id=user.id, label=f"v{i}", content_text=BACKEND_CV, is_default=i == 0
            )
            for i in range(3)
        ]
        session.add_all(resumes)
        session.commit()
        ids = (user.id, [r.id for r in resumes])
    try:
        yield ids
    finally:
        with Session(engine) as session:
            session.execute(delete(User).where(User.id == ids[0]))
            session.commit()


def test_concurrent_set_default_requests_never_fail(
    engine: Engine, committed_user: tuple[uuid.UUID, list[uuid.UUID]]
) -> None:
    user_id, (_, second, third) = committed_user
    start = threading.Barrier(2)
    errors: list[BaseException] = []

    def make_default(resume_id: uuid.UUID) -> None:
        try:
            with Session(engine) as session:
                user = session.get_one(User, user_id)
                start.wait(timeout=5)
                service.update_resume(session, user, resume_id, ResumeUpdate(is_default=True))
        except BaseException as exc:  # asserted empty below, in the test thread
            errors.append(exc)

    for _ in range(5):  # a few rounds: each one is a fresh race
        threads = [threading.Thread(target=make_default, args=(rid,)) for rid in (second, third)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert errors == []
        with Session(engine) as session:
            current = session.scalars(
                select(ResumeVersion.id).where(
                    ResumeVersion.user_id == user_id, ResumeVersion.is_default
                )
            ).all()
        assert len(current) == 1 and current[0] in (second, third)
