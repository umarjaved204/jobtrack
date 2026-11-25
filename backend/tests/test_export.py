import csv
import io
import json
import zipfile
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_header

EXPORT = "/api/v1/export"
API = "/api/v1"
Headers = dict[str, str]


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


def post(client: TestClient, path: str, headers: Headers, **payload: Any) -> dict[str, Any]:
    response = client.post(f"{API}{path}", headers=headers, json=payload)
    assert response.status_code in (200, 201), response.text
    body: dict[str, Any] = response.json()
    return body


def fill_account(client: TestClient, headers: Headers, marker: str) -> dict[str, str]:
    """One of everything the export covers, each carrying `marker` in its text."""
    tag = post(client, "/tags", headers, name=f"{marker} tag", color="cobalt")
    resume = post(
        client,
        "/resumes",
        headers,
        label=f"{marker} resume",
        content_text=f"{marker} Engineer\n\nPython, FastAPI, PostgreSQL",
    )
    app = post(
        client,
        "/applications",
        headers,
        company=f"{marker} Ltd",
        role_title="Backend Engineer",
        status="applied",
        applied_on="2026-11-02",
        salary_min=60000,
        salary_max=75000,
        salary_currency="GBP",
        source="Referral",
        resume_version_id=resume["id"],
        tag_ids=[tag["id"]],
    )
    post(client, f"/applications/{app['id']}/contacts", headers, name=f"{marker} recruiter")
    post(client, f"/applications/{app['id']}/events", headers, body=f"{marker} note")
    post(
        client,
        f"/applications/{app['id']}/move",
        headers,
        status="screening",
        position=1024,
    )
    post(client, "/reminders", headers, title=f"{marker} follow-up", due_on="2026-11-20")
    post(
        client,
        "/calendar-events",
        headers,
        kind="interview",
        title=f"{marker} interview",
        starts_at="2026-11-24T14:00:00+05:00",
        application_id=app["id"],
    )
    return {"tag": tag["id"], "resume": resume["id"], "application": app["id"]}


def export(client: TestClient, headers: Headers, fmt: str) -> Any:
    response = client.get(EXPORT, headers=headers, params={"format": fmt})
    assert response.status_code == 200, response.text
    return response


def unzip_text(content: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        return {name: archive.read(name).decode("utf-8-sig") for name in archive.namelist()}


def unzip(content: bytes) -> dict[str, list[dict[str, str]]]:
    return {
        name: list(csv.DictReader(io.StringIO(text))) for name, text in unzip_text(content).items()
    }


# --------------------------------------------------------------------------- JSON


def test_json_holds_everything_the_user_entered(client: TestClient, ayesha: Headers) -> None:
    ids = fill_account(client, ayesha, "Careem")

    response = export(client, ayesha, "json")
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="jobtrack-export-'
    )
    assert response.headers["content-disposition"].endswith('.json"')
    assert response.headers["cache-control"] == "no-store"

    doc = response.json()
    assert doc["format_version"] == 1
    assert doc["exported_at"].endswith("Z")
    assert doc["user"] | {"created_at": None} == {
        "email": "ayesha.khan@example.com",
        "full_name": "Ayesha Khan",
        "theme": "system",
        "accent": "vermilion",
        "created_at": None,
    }
    assert "password_hash" not in json.dumps(doc)

    [app] = doc["applications"]
    assert app["id"] == ids["application"]
    assert app["status"] == "screening"
    assert app["applied_on"] == "2026-11-02"
    assert app["resume_version_id"] == ids["resume"]
    assert app["tags"] == ["Careem tag"]
    assert "position" not in app
    assert [c["name"] for c in app["contacts"]] == ["Careem recruiter"]
    assert [(e["type"], e["body"], e["to_status"]) for e in app["timeline"]] == [
        ("status_change", None, "applied"),
        ("note", "Careem note", None),
        ("status_change", None, "screening"),
    ]

    assert [t["id"] for t in doc["tags"]] == [ids["tag"]]
    [resume] = doc["resume_versions"]
    assert resume["content_text"] == "Careem Engineer\n\nPython, FastAPI, PostgreSQL"
    [reminder] = doc["reminders"]
    assert (reminder["due_on"], reminder["due_at"]) == ("2026-11-20", None)
    [event] = doc["calendar_events"]
    # Instants are UTC: 14:00 in Karachi is 09:00Z.
    assert event["starts_at"] == "2026-11-24T09:00:00Z"
    assert event["application_id"] == ids["application"]


def test_an_empty_account_exports_empty_lists(client: TestClient, ayesha: Headers) -> None:
    doc = export(client, ayesha, "json").json()

    for key in ("applications", "tags", "resume_versions", "reminders", "calendar_events"):
        assert doc[key] == [], key


# --------------------------------------------------------------------------- CSV


def test_csv_is_a_zip_with_one_file_per_table(client: TestClient, ayesha: Headers) -> None:
    ids = fill_account(client, ayesha, "Careem")

    response = export(client, ayesha, "csv")
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"].endswith('.zip"')
    tables = unzip(response.content)

    assert sorted(tables) == [
        "applications.csv",
        "calendar_events.csv",
        "contacts.csv",
        "reminders.csv",
        "resume_versions.csv",
        "tags.csv",
        "timeline.csv",
    ]
    [app] = tables["applications.csv"]
    assert app["id"] == ids["application"]
    assert app["tags"] == "Careem tag"
    assert app["salary_min"] == "60000"
    assert app["location"] == ""  # null
    assert "contacts" not in app and "timeline" not in app
    assert [c["application_id"] for c in tables["contacts.csv"]] == [ids["application"]]
    assert [e["type"] for e in tables["timeline.csv"]] == ["status_change", "note", "status_change"]
    # Multi-line text survives the round trip.
    [resume] = tables["resume_versions.csv"]
    assert resume["content_text"] == "Careem Engineer\n\nPython, FastAPI, PostgreSQL"
    assert tables["calendar_events.csv"][0]["starts_at"] == "2026-11-24T09:00:00Z"


def test_csv_files_start_with_a_bom_and_keep_headers_when_empty(
    client: TestClient, ayesha: Headers
) -> None:
    content = export(client, ayesha, "csv").content

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        raw = archive.read("reminders.csv")
    assert raw.startswith("﻿".encode())
    assert raw.decode("utf-8-sig") == "id,application_id,title,due_on,due_at,done_at\r\n"


def test_csv_neutralises_cells_a_spreadsheet_would_run(client: TestClient, ayesha: Headers) -> None:
    app = post(
        client, "/applications", ayesha, company='=HYPERLINK("http://x")', role_title="@SUM(1)"
    )
    post(client, f"/applications/{app['id']}/events", ayesha, body="-2+3")

    tables = unzip(export(client, ayesha, "csv").content)

    [row] = tables["applications.csv"]
    assert row["company"] == '\'=HYPERLINK("http://x")'
    assert row["role_title"] == "'@SUM(1)"
    assert [e["body"] for e in tables["timeline.csv"] if e["type"] == "note"] == ["'-2+3"]
    # The JSON keeps the text exactly as stored.
    doc = export(client, ayesha, "json").json()
    assert doc["applications"][0]["company"] == '=HYPERLINK("http://x")'


# --------------------------------------------------------------------------- ownership


@pytest.mark.parametrize("fmt", ["json", "csv"])
def test_export_holds_only_the_users_own_data(
    client: TestClient, ayesha: Headers, bilal: Headers, fmt: str
) -> None:
    mine = fill_account(client, ayesha, "Careem")
    theirs = fill_account(client, bilal, "Daraz")

    content = export(client, ayesha, fmt).content
    text = "".join(unzip_text(content).values()) if fmt == "csv" else content.decode()

    assert "Daraz" not in text
    assert "bilal" not in text.lower()
    for value in theirs.values():
        assert value not in text
    for value in mine.values():
        assert value in text


# --------------------------------------------------------------------------- requests


def test_export_needs_a_signed_in_user(client: TestClient) -> None:
    assert client.get(EXPORT, params={"format": "json"}).status_code == 401


@pytest.mark.parametrize("params", [{}, {"format": "xlsx"}, {"format": "JSON"}])
def test_export_needs_a_known_format(
    client: TestClient, ayesha: Headers, params: dict[str, str]
) -> None:
    assert client.get(EXPORT, headers=ayesha, params=params).status_code == 422
