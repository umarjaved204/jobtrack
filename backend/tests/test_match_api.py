"""The match API: config, prepare, create (client and server modes), list and read.

Client-mode vectors come from `FakeEmbedder` at the browser model's 384 dimensions: the
API can't tell them from real ones, which is exactly what it can and can't check.
"""

import base64
import uuid
from collections.abc import Callable, Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import MatchResult, ResumeVersion
from app.schemas.match import MAX_JD_CHARS, MAX_JD_CHUNKS, MAX_RESUME_CHUNKS
from app.services.match import service
from app.services.match.browser_model import BROWSER_MODEL, BROWSER_MODEL_NAME
from app.services.match.chunking import Chunk
from app.services.match.embedder import FakeEmbedder, Vectors
from app.services.match.scoring import CALIBRATIONS, Calibration, score_match
from app.services.match.semantic import max_sim
from app.services.match.skills import compare_skills
from tests.conftest import auth_header

MATCH = "/api/v1/match"
RESUMES = "/api/v1/resumes"
APPS = "/api/v1/applications"
Headers = dict[str, str]

RESUME = """Ayesha Khan
Backend engineer, Lahore

- Built shipment tracking APIs in Python with FastAPI and PostgreSQL.
- Ran background jobs with Celery and Redis; deployed with Docker on AWS.
- Wrote pytest suites and reviewed code for a team of six."""

JD = """Backend Engineer, Careem Logistics

Requirements:
- Python and FastAPI or Django
- PostgreSQL in production
- Kubernetes

Nice to have:
- Go

Benefits
- Private health insurance"""


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register(email="bilal.ahmed@example.com")["access_token"])


@pytest.fixture
def mode(monkeypatch: pytest.MonkeyPatch) -> Callable[[str], None]:
    def _set(value: str) -> None:
        monkeypatch.setattr(get_settings(), "match_embeddings", value)

    return _set


def create_resume(client: TestClient, headers: Headers, text: str = RESUME) -> str:
    response = client.post(
        RESUMES, headers=headers, json={"label": "Backend", "content_text": text}
    )
    assert response.status_code == 201, response.text
    resume_id: str = response.json()["id"]
    return resume_id


def create_application(client: TestClient, headers: Headers) -> str:
    response = client.post(
        APPS, headers=headers, json={"company": "Careem", "role_title": "Backend Engineer"}
    )
    assert response.status_code == 201, response.text
    app_id: str = response.json()["id"]
    return app_id


def fake_vectors(texts: list[str]) -> Vectors:
    vectors = FakeEmbedder(dim=BROWSER_MODEL.dim).embed(texts)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors[norms[:, 0] == 0, 0] = 1.0  # a text with no words: any unit vector
    normalised: Vectors = (vectors / np.linalg.norm(vectors, axis=1, keepdims=True)).astype(
        np.float32
    )
    return normalised


def encode(vectors: Vectors) -> str:
    return base64.b64encode(vectors.astype("<f4").tobytes()).decode()


def prepare(client: TestClient, headers: Headers, resume_id: str, jd: str = JD) -> Any:
    return client.post(
        f"{MATCH}/prepare", headers=headers, json={"resume_id": resume_id, "jd_text": jd}
    )


def embeddings_for(prepared: dict[str, Any]) -> dict[str, str]:
    return {
        "digest": prepared["digest"],
        "jd": encode(fake_vectors(prepared["jd_chunks"])),
        "resume": encode(fake_vectors(prepared["resume_chunks"])),
    }


def run_match(
    client: TestClient, headers: Headers, resume_id: str, jd: str = JD, **fields: Any
) -> Any:
    prepared = prepare(client, headers, resume_id, jd)
    assert prepared.status_code == 200, prepared.text
    payload = {
        "resume_id": resume_id,
        "jd_text": jd,
        "embeddings": embeddings_for(prepared.json()),
    } | fields
    return client.post(MATCH, headers=headers, json=payload)


def field_errors(response: Any) -> list[tuple[str, ...]]:
    return [tuple(map(str, e["loc"])) for e in response.json()["detail"]]


# ---------------------------------------------------------------- config


def test_config_describes_client_mode(client: TestClient, ayesha: Headers) -> None:
    body = client.get(f"{MATCH}/config", headers=ayesha).json()
    assert body == {
        "embeddings": "client",
        "model": {
            "id": BROWSER_MODEL.id,
            "revision": BROWSER_MODEL.revision,
            "dtype": "q8",
            "dim": 384,
        },
        "max_jd_chars": MAX_JD_CHARS,
        "max_resume_chunks": MAX_RESUME_CHUNKS,
        "max_jd_chunks": MAX_JD_CHUNKS,
    }


def test_match_needs_a_session(client: TestClient) -> None:
    assert client.get(f"{MATCH}/config").status_code == 401
    assert client.get(MATCH).status_code == 401


# ---------------------------------------------------------------- client mode


def test_prepare_returns_chunks_without_ignored_sections(
    client: TestClient, ayesha: Headers
) -> None:
    body = prepare(client, ayesha, create_resume(client, ayesha)).json()
    assert body["model"]["revision"] == BROWSER_MODEL.revision
    assert len(body["digest"]) == 64
    assert "Python and FastAPI or Django" in body["jd_chunks"]
    assert "Private health insurance" not in body["jd_chunks"]
    assert body["resume_chunks"][0] == "Ayesha Khan"


def test_a_match_is_scored_from_the_vectors_and_the_text(
    client: TestClient, ayesha: Headers
) -> None:
    resume_id = create_resume(client, ayesha)
    prepared = prepare(client, ayesha, resume_id).json()
    embeddings = embeddings_for(prepared)
    response = client.post(
        MATCH,
        headers=ayesha,
        json={"resume_id": resume_id, "jd_text": JD, "embeddings": embeddings},
    )
    assert response.status_code == 201, response.text
    body = response.json()

    # The same pipeline by hand: max-sim on the vectors, skills from the text.
    jd_chunks = [Chunk(t, 0.5 if t == "Go" else 1.0) for t in prepared["jd_chunks"]]
    semantic = max_sim(
        jd_chunks,
        fake_vectors(prepared["jd_chunks"]),
        prepared["resume_chunks"],
        fake_vectors(prepared["resume_chunks"]),
    )
    skills = compare_skills(JD, RESUME)
    expected = score_match(skills.coverage, semantic.similarity, CALIBRATIONS[BROWSER_MODEL_NAME])
    assert body["score"] == expected.value
    assert body["skill_coverage"] == pytest.approx(expected.skill_coverage)
    assert body["semantic_score"] == pytest.approx(expected.semantic, abs=1e-5)

    assert body["matched_skills"] == [
        {"skills": ["Python"], "label": "Python", "required": True},
        {"skills": ["FastAPI", "Django"], "label": "FastAPI or Django", "required": True},
        {"skills": ["PostgreSQL"], "label": "PostgreSQL", "required": True},
    ]
    assert [r["label"] for r in body["missing_skills"]] == ["Kubernetes", "Go"]
    assert body["missing_skills"][1]["required"] is False
    assert body["suggested_keywords"][:2] == ["Kubernetes", "Go"]
    assert 0 < len(body["evidence"]) <= 5
    assert set(body["evidence"][0]) == {"jd_text", "resume_text", "similarity"}
    assert body["sections_detected"] is True
    assert body["model_name"] == BROWSER_MODEL_NAME
    assert body["is_current"] is True
    assert body["resume_label"] == "Backend"
    assert body["jd_excerpt"] == "Backend Engineer, Careem Logistics"
    assert body["jd_text"] == JD
    assert (body["application_id"], body["company"]) == (None, None)


def test_a_match_freezes_the_resume_text(client: TestClient, ayesha: Headers) -> None:
    resume_id = create_resume(client, ayesha)
    assert run_match(client, ayesha, resume_id).status_code == 201
    resume = client.get(f"{RESUMES}/{resume_id}", headers=ayesha).json()
    assert resume["match_count"] == 1
    edit = client.patch(f"{RESUMES}/{resume_id}", headers=ayesha, json={"content_text": "New"})
    assert edit.status_code == 409


def test_a_match_can_be_linked_to_an_application(client: TestClient, ayesha: Headers) -> None:
    app_id = create_application(client, ayesha)
    body = run_match(client, ayesha, create_resume(client, ayesha), application_id=app_id).json()
    assert (body["application_id"], body["company"], body["role_title"]) == (
        app_id,
        "Careem",
        "Backend Engineer",
    )


def test_texts_changed_since_prepare_are_a_conflict(client: TestClient, ayesha: Headers) -> None:
    resume_id = create_resume(client, ayesha)
    prepared = prepare(client, ayesha, resume_id).json()
    edited = client.patch(
        f"{RESUMES}/{resume_id}", headers=ayesha, json={"content_text": RESUME + "\n- Go"}
    )
    assert edited.status_code == 200
    response = client.post(
        MATCH,
        headers=ayesha,
        json={"resume_id": resume_id, "jd_text": JD, "embeddings": embeddings_for(prepared)},
    )
    assert response.status_code == 409
    other_jd = client.post(
        MATCH,
        headers=ayesha,
        json={
            "resume_id": resume_id,
            # In a section that counts: a line added under "Benefits" isn't chunked, so it
            # wouldn't change the digest (and the vectors would still be right).
            "jd_text": JD.replace("- Kubernetes", "- Kubernetes\n- Rust"),
            "embeddings": embeddings_for(prepare(client, ayesha, resume_id).json()),
        },
    )
    assert other_jd.status_code == 409


def test_a_text_edit_between_scoring_and_saving_is_a_conflict(
    client: TestClient, db: Session, ayesha: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Deterministic stand-in for the race: the edit lands while the match is being scored."""
    resume_id = create_resume(client, ayesha)
    real_compare = compare_skills

    def compare_then_edit(jd_text: str, resume_text: str) -> Any:
        db.execute(
            update(ResumeVersion)
            .where(ResumeVersion.id == uuid.UUID(resume_id))
            .values(content_text="Edited meanwhile")
        )
        return real_compare(jd_text, resume_text)

    monkeypatch.setattr(service, "compare_skills", compare_then_edit)
    assert run_match(client, ayesha, resume_id).status_code == 409
    assert client.get(MATCH, headers=ayesha).json()["total"] == 0


def _with_vectors(prepared: dict[str, Any], jd: Vectors, resume: Vectors) -> dict[str, str]:
    return {"digest": prepared["digest"], "jd": encode(jd), "resume": encode(resume)}


@pytest.mark.parametrize("problem", ["count", "base64", "nan", "length"])
def test_vectors_are_checked(client: TestClient, ayesha: Headers, problem: str) -> None:
    resume_id = create_resume(client, ayesha)
    prepared = prepare(client, ayesha, resume_id).json()
    jd = fake_vectors(prepared["jd_chunks"])
    resume = fake_vectors(prepared["resume_chunks"])
    embeddings = _with_vectors(prepared, jd, resume)
    if problem == "count":
        embeddings["jd"] = encode(jd[:-1])
    elif problem == "base64":
        embeddings["resume"] = "not base64!"
    elif problem == "nan":
        resume[0, 0] = np.nan
        embeddings["resume"] = encode(resume)
    else:
        embeddings["jd"] = encode(jd * 1.5)
    response = client.post(
        MATCH,
        headers=ayesha,
        json={"resume_id": resume_id, "jd_text": JD, "embeddings": embeddings},
    )
    assert response.status_code == 422, response.text
    assert field_errors(response) == [("body", "embeddings")]


def test_client_mode_needs_the_vectors(client: TestClient, ayesha: Headers) -> None:
    response = client.post(
        MATCH, headers=ayesha, json={"resume_id": create_resume(client, ayesha), "jd_text": JD}
    )
    assert response.status_code == 422
    assert field_errors(response) == [("body", "embeddings")]


# ---------------------------------------------------------------- inputs


def test_other_users_resumes_and_applications_are_not_found(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    theirs = create_resume(client, bilal)
    assert prepare(client, ayesha, theirs).status_code == 404
    assert prepare(client, ayesha, str(uuid.uuid4())).status_code == 404

    mine = create_resume(client, ayesha)
    their_app = create_application(client, bilal)
    assert run_match(client, ayesha, mine, application_id=their_app).status_code == 404


def test_archived_resumes_cannot_be_matched(client: TestClient, ayesha: Headers) -> None:
    resume_id = create_resume(client, ayesha)
    client.patch(f"{RESUMES}/{resume_id}", headers=ayesha, json={"archived": True})
    assert prepare(client, ayesha, resume_id).status_code == 422


@pytest.mark.parametrize("jd", ["  \n ", "x" * (MAX_JD_CHARS + 1)])
def test_the_jd_is_required_and_limited(client: TestClient, ayesha: Headers, jd: str) -> None:
    response = prepare(client, ayesha, create_resume(client, ayesha), jd)
    assert response.status_code == 422
    assert field_errors(response) == [("body", "jd_text")]


def test_too_many_lines_are_refused(client: TestClient, ayesha: Headers) -> None:
    long_jd = "\n".join(f"Line {i}" for i in range(MAX_JD_CHUNKS + 1))
    response = prepare(client, ayesha, create_resume(client, ayesha), long_jd)
    assert response.status_code == 422
    assert field_errors(response) == [("body", "jd_text")]

    long_resume = "\n".join(f"Item {i}" for i in range(MAX_RESUME_CHUNKS + 1))
    response = prepare(client, ayesha, create_resume(client, ayesha, long_resume))
    assert response.status_code == 422
    assert "too many separate lines" in response.json()["detail"]


def test_matches_are_rate_limited_per_user(
    client: TestClient, ayesha: Headers, bilal: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_match_per_user", 1)
    resume_id = create_resume(client, ayesha)
    assert prepare(client, ayesha, resume_id).status_code == 200
    limited = prepare(client, ayesha, resume_id)
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0
    assert prepare(client, bilal, create_resume(client, bilal)).status_code == 200


# ---------------------------------------------------------------- reading back


def test_results_are_listed_newest_first_and_filtered(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    resume_id = create_resume(client, ayesha)
    app_id = create_application(client, ayesha)
    first = run_match(client, ayesha, resume_id).json()
    long_title = "Senior " * 30 + "Engineer"
    second = run_match(client, ayesha, resume_id, f"{long_title}\n{JD}", application_id=app_id)
    second_body = second.json()
    run_match(client, bilal, create_resume(client, bilal))

    page = client.get(MATCH, headers=ayesha).json()
    assert page["total"] == 2
    assert [m["id"] for m in page["items"]] == [second_body["id"], first["id"]]
    assert page["items"][0]["jd_excerpt"].endswith("…")
    assert len(page["items"][0]["jd_excerpt"]) <= service.JD_EXCERPT_CHARS
    assert page["items"][0]["company"] == "Careem"
    assert "jd_text" not in page["items"][0]

    filtered = client.get(MATCH, headers=ayesha, params={"application_id": app_id}).json()
    assert [m["id"] for m in filtered["items"]] == [second_body["id"]]

    paged = client.get(MATCH, headers=ayesha, params={"page": 2, "page_size": 1}).json()
    assert ([m["id"] for m in paged["items"]], paged["pages"]) == ([first["id"]], 2)


def test_other_users_results_are_not_found(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    match_id = run_match(client, ayesha, create_resume(client, ayesha)).json()["id"]
    assert client.get(f"{MATCH}/{match_id}", headers=bilal).status_code == 404
    assert client.get(MATCH, headers=bilal).json()["total"] == 0


def test_older_versions_are_not_current(client: TestClient, db: Session, ayesha: Headers) -> None:
    match_id = run_match(client, ayesha, create_resume(client, ayesha)).json()["id"]
    db.execute(
        update(MatchResult).where(MatchResult.id == uuid.UUID(match_id)).values(scoring_version=0)
    )
    db.commit()
    assert client.get(f"{MATCH}/{match_id}", headers=ayesha).json()["is_current"] is False
    assert client.get(MATCH, headers=ayesha).json()["items"][0]["is_current"] is False


# ---------------------------------------------------------------- other modes


def test_off_mode_refuses_matches(
    client: TestClient, ayesha: Headers, mode: Callable[[str], None]
) -> None:
    resume_id = create_resume(client, ayesha)
    mode("off")
    assert client.get(f"{MATCH}/config", headers=ayesha).json()["embeddings"] == "off"
    assert prepare(client, ayesha, resume_id).status_code == 503
    create = client.post(MATCH, headers=ayesha, json={"resume_id": resume_id, "jd_text": JD})
    assert create.status_code == 503


@pytest.fixture
def server_mode(
    mode: Callable[[str], None], monkeypatch: pytest.MonkeyPatch
) -> Iterator[FakeEmbedder]:
    embedder = FakeEmbedder()
    mode("server")
    monkeypatch.setattr(service, "_local_embedder", lambda: embedder)
    monkeypatch.setattr(service, "_active_model_name", lambda _: embedder.model_name)
    monkeypatch.setitem(CALIBRATIONS, embedder.model_name, Calibration(1, zero=0.0, one=1.0))
    service._server_cache.clear()
    yield embedder
    service._server_cache.clear()


def test_server_mode_embeds_on_the_server(
    client: TestClient, ayesha: Headers, server_mode: FakeEmbedder
) -> None:
    resume_id = create_resume(client, ayesha)
    assert client.get(f"{MATCH}/config", headers=ayesha).json()["model"] is None
    assert prepare(client, ayesha, resume_id).status_code == 422

    response = client.post(MATCH, headers=ayesha, json={"resume_id": resume_id, "jd_text": JD})
    assert response.status_code == 201, response.text
    assert response.json()["model_name"] == server_mode.model_name
    assert response.json()["is_current"] is True
    assert server_mode.embedded_texts > 0

    with_vectors = client.post(
        MATCH,
        headers=ayesha,
        json={
            "resume_id": resume_id,
            "jd_text": JD,
            "embeddings": {"digest": "0" * 64, "jd": "", "resume": ""},
        },
    )
    assert with_vectors.status_code == 422


def test_server_mode_runs_one_match_at_a_time(
    client: TestClient,
    ayesha: Headers,
    server_mode: FakeEmbedder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resume_id = create_resume(client, ayesha)
    monkeypatch.setattr(service, "SERVER_WAIT_SECONDS", 0)
    assert service._server_slot.acquire(timeout=1)
    try:
        response = client.post(MATCH, headers=ayesha, json={"resume_id": resume_id, "jd_text": JD})
    finally:
        service._server_slot.release()
    assert response.status_code == 503
    assert response.headers["Retry-After"] == str(service.BUSY_RETRY_AFTER_SECONDS)
