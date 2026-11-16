from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_header

TAGS = "/api/v1/tags"
Headers = dict[str, str]


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


def test_create_list_update_delete(client: TestClient, ayesha: Headers) -> None:
    created = client.post(TAGS, headers=ayesha, json={"name": " Remote ", "color": "cobalt"})
    client.post(TAGS, headers=ayesha, json={"name": "Dream job"})

    assert created.status_code == 201
    assert created.json()["name"] == "Remote"
    tags = client.get(TAGS, headers=ayesha).json()
    assert [(t["name"], t["color"]) for t in tags] == [("Dream job", "ink"), ("Remote", "cobalt")]

    tag_id = created.json()["id"]
    renamed = client.patch(f"{TAGS}/{tag_id}", headers=ayesha, json={"name": "Remote-first"})
    assert renamed.json() == {"id": tag_id, "name": "Remote-first", "color": "cobalt"}
    recoloured = client.patch(f"{TAGS}/{tag_id}", headers=ayesha, json={"color": "vermilion"})
    assert recoloured.json() == {"id": tag_id, "name": "Remote-first", "color": "vermilion"}

    assert client.delete(f"{TAGS}/{tag_id}", headers=ayesha).status_code == 204
    assert [t["name"] for t in client.get(TAGS, headers=ayesha).json()] == ["Dream job"]


def test_names_are_unique_per_user_case_insensitively(
    client: TestClient, ayesha: Headers, bilal: Headers
) -> None:
    client.post(TAGS, headers=ayesha, json={"name": "Remote"})
    other = client.post(TAGS, headers=ayesha, json={"name": "Referral"}).json()

    duplicate = client.post(TAGS, headers=ayesha, json={"name": "REMOTE"})
    rename_clash = client.patch(f"{TAGS}/{other['id']}", headers=ayesha, json={"name": "remote"})
    someone_else = client.post(TAGS, headers=bilal, json={"name": "Remote"})

    assert duplicate.status_code == 409
    assert rename_clash.status_code == 409
    assert someone_else.status_code == 201  # unique per user, not globally


def test_tags_are_private(client: TestClient, ayesha: Headers, bilal: Headers) -> None:
    tag_id = client.post(TAGS, headers=ayesha, json={"name": "Remote"}).json()["id"]

    assert client.get(TAGS, headers=bilal).json() == []
    assert client.patch(f"{TAGS}/{tag_id}", headers=bilal, json={"color": "red"}).status_code == 404
    assert client.delete(f"{TAGS}/{tag_id}", headers=bilal).status_code == 404


def test_deleting_a_tag_detaches_it_from_applications(client: TestClient, ayesha: Headers) -> None:
    tag_id = client.post(TAGS, headers=ayesha, json={"name": "Remote"}).json()["id"]
    app = client.post(
        "/api/v1/applications",
        headers=ayesha,
        json={"company": "Stripe", "role_title": "Software Engineer", "tag_ids": [tag_id]},
    ).json()

    client.delete(f"{TAGS}/{tag_id}", headers=ayesha)

    refreshed = client.get(f"/api/v1/applications/{app['id']}", headers=ayesha).json()
    assert refreshed["tags"] == []


@pytest.mark.parametrize(
    "payload", [{"name": ""}, {"name": "x" * 41}, {"name": "A", "color": "#FF0000"}]
)
def test_rejects_invalid_tags(client: TestClient, ayesha: Headers, payload: dict[str, str]) -> None:
    assert client.post(TAGS, headers=ayesha, json=payload).status_code == 422
