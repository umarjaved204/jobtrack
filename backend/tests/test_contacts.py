from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_header

APPS = "/api/v1/applications"
CONTACTS = "/api/v1/contacts"
Headers = dict[str, str]


@pytest.fixture
def ayesha(register: Callable[..., dict[str, Any]]) -> Headers:
    return auth_header(register()["access_token"])


@pytest.fixture
def bilal(register: Callable[..., dict[str, Any]]) -> Headers:
    body = register(email="bilal.ahmed@example.com", full_name="Bilal Ahmed")
    return auth_header(body["access_token"])


@pytest.fixture
def monzo(client: TestClient, ayesha: Headers) -> str:
    """Ayesha's application id."""
    response = client.post(
        APPS, headers=ayesha, json={"company": "Monzo", "role_title": "Frontend Engineer"}
    )
    assert response.status_code == 201, response.text
    application_id: str = response.json()["id"]
    return application_id


PRIYA = {
    "name": "Priya Shah",
    "role": "Engineering Manager",
    "email": "priya.shah@monzo.com",
    "phone": "+44 20 7946 0958",
    "linkedin_url": "https://www.linkedin.com/in/priya-shah",
    "notes": "Prefers a short intro email before calls.",
}


def add_contact(client: TestClient, headers: Headers, application_id: str, **fields: Any) -> Any:
    return client.post(f"{APPS}/{application_id}/contacts", headers=headers, json=fields)


# ---------------------------------------------------------------- CRUD


def test_create_list_update_delete(client: TestClient, ayesha: Headers, monzo: str) -> None:
    created = add_contact(client, ayesha, monzo, **PRIYA)
    add_contact(client, ayesha, monzo, name="Daniel Okoro", role="Recruiter")

    assert created.status_code == 201
    body = created.json()
    assert body == {"id": body["id"], "application_id": monzo, **PRIYA}

    listed = client.get(f"{APPS}/{monzo}/contacts", headers=ayesha).json()
    assert [c["name"] for c in listed] == ["Daniel Okoro", "Priya Shah"]  # by name

    contact_id = body["id"]
    assert client.delete(f"{CONTACTS}/{contact_id}", headers=ayesha).status_code == 204
    listed = client.get(f"{APPS}/{monzo}/contacts", headers=ayesha).json()
    assert [c["name"] for c in listed] == ["Daniel Okoro"]


def test_only_a_name_is_required_and_text_is_trimmed(
    client: TestClient, ayesha: Headers, monzo: str
) -> None:
    response = add_contact(client, ayesha, monzo, name="  Daniel Okoro  ")
    assert response.status_code == 201
    assert response.json() | {"id": None} == {
        "id": None,
        "application_id": monzo,
        "name": "Daniel Okoro",
        "role": None,
        "email": None,
        "phone": None,
        "linkedin_url": None,
        "notes": None,
    }


# ---------------------------------------------------------------- PATCH semantics


def test_patch_changes_only_sent_fields(client: TestClient, ayesha: Headers, monzo: str) -> None:
    contact_id = add_contact(client, ayesha, monzo, **PRIYA).json()["id"]

    response = client.patch(
        f"{CONTACTS}/{contact_id}", headers=ayesha, json={"role": "Director of Engineering"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": contact_id,
        "application_id": monzo,
        **PRIYA,
        "role": "Director of Engineering",
    }


def test_patch_null_clears_optional_fields(client: TestClient, ayesha: Headers, monzo: str) -> None:
    contact_id = add_contact(client, ayesha, monzo, **PRIYA).json()["id"]

    response = client.patch(
        f"{CONTACTS}/{contact_id}", headers=ayesha, json={"phone": None, "notes": None}
    )

    body = response.json()
    assert (body["phone"], body["notes"]) == (None, None)
    assert body["email"] == PRIYA["email"]  # untouched


@pytest.mark.parametrize(
    "payload",
    [{"name": None}, {"name": "   "}, {"company": "Monzo"}],
    ids=["name cleared", "blank name", "unknown field"],
)
def test_patch_rejects_invalid_changes(
    client: TestClient, ayesha: Headers, monzo: str, payload: dict[str, Any]
) -> None:
    contact_id = add_contact(client, ayesha, monzo, **PRIYA).json()["id"]
    response = client.patch(f"{CONTACTS}/{contact_id}", headers=ayesha, json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------- validation


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "priya@"),
        ("email", "not an email"),
        ("linkedin_url", "javascript:alert(1)"),
        ("linkedin_url", "ftp://linkedin.com/in/priya"),
        ("linkedin_url", "linkedin.com/in/priya"),  # no scheme
        ("linkedin_url", "https://www.linkedin.com/in/" + "p" * 2100),
        ("name", "n" * 121),
        ("phone", "1" * 41),
        ("notes", "x" * 5001),
    ],
)
def test_rejects_invalid_fields(
    client: TestClient, ayesha: Headers, monzo: str, field: str, value: str
) -> None:
    response = add_contact(client, ayesha, monzo, **{"name": "Priya Shah", field: value})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:2] == ["body", field]


def test_accepts_any_https_profile_url(client: TestClient, ayesha: Headers, monzo: str) -> None:
    # Regional subdomains and short links are real LinkedIn URLs too.
    for url in ("https://uk.linkedin.com/in/priya-shah", "https://lnkd.in/abc123"):
        assert add_contact(client, ayesha, monzo, name="Priya", linkedin_url=url).status_code == 201


# ---------------------------------------------------------------- ownership (404, never 403)


def test_cannot_use_another_users_application(
    client: TestClient, bilal: Headers, monzo: str
) -> None:
    assert client.get(f"{APPS}/{monzo}/contacts", headers=bilal).status_code == 404
    assert add_contact(client, bilal, monzo, name="Mallory").status_code == 404


def test_cannot_touch_another_users_contact(
    client: TestClient, ayesha: Headers, bilal: Headers, monzo: str
) -> None:
    contact_id = add_contact(client, ayesha, monzo, **PRIYA).json()["id"]

    assert (
        client.patch(f"{CONTACTS}/{contact_id}", headers=bilal, json={"name": "X"}).status_code
        == 404
    )
    assert client.delete(f"{CONTACTS}/{contact_id}", headers=bilal).status_code == 404
    # Still intact for the owner.
    listed = client.get(f"{APPS}/{monzo}/contacts", headers=ayesha).json()
    assert [c["name"] for c in listed] == ["Priya Shah"]


def test_unknown_ids_are_404(client: TestClient, ayesha: Headers) -> None:
    missing = "00000000-0000-0000-0000-000000000000"
    assert client.get(f"{APPS}/{missing}/contacts", headers=ayesha).status_code == 404
    assert client.patch(f"{CONTACTS}/{missing}", headers=ayesha, json={}).status_code == 404
    assert client.delete(f"{CONTACTS}/{missing}", headers=ayesha).status_code == 404


def test_requires_authentication(client: TestClient, monzo: str) -> None:
    assert client.get(f"{APPS}/{monzo}/contacts").status_code == 401


def test_contacts_are_deleted_with_their_application(
    client: TestClient, ayesha: Headers, monzo: str
) -> None:
    contact_id = add_contact(client, ayesha, monzo, **PRIYA).json()["id"]

    assert client.delete(f"{APPS}/{monzo}", headers=ayesha).status_code == 204

    assert client.patch(f"{CONTACTS}/{contact_id}", headers=ayesha, json={}).status_code == 404
