from collections.abc import Callable
from datetime import date
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Application, RefreshToken, User
from app.models.enums import ApplicationStatus
from tests.conftest import DEFAULT_PASSWORD, auth_header

ME = "/api/v1/users/me"

Register = Callable[..., dict[str, Any]]


def test_read_me(client: TestClient, register: Register) -> None:
    token = register()["access_token"]

    response = client.get(ME, headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["email"] == "ayesha.khan@example.com"
    assert response.json()["accent"] == "vermilion"


def test_update_me_changes_only_sent_fields(client: TestClient, register: Register) -> None:
    token = register()["access_token"]

    response = client.patch(ME, headers=auth_header(token), json={"theme": "dark"})

    assert response.status_code == 200
    assert response.json()["theme"] == "dark"
    assert response.json()["full_name"] == "Ayesha Khan"  # untouched


def test_update_me_ignores_explicit_nulls(client: TestClient, register: Register) -> None:
    token = register()["access_token"]

    response = client.patch(
        ME, headers=auth_header(token), json={"full_name": None, "accent": "cobalt"}
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Ayesha Khan"
    assert response.json()["accent"] == "cobalt"


def test_update_me_rejects_invalid_and_unknown_fields(
    client: TestClient, register: Register
) -> None:
    token = register()["access_token"]

    assert client.patch(ME, headers=auth_header(token), json={"theme": "neon"}).status_code == 422
    assert (
        client.patch(ME, headers=auth_header(token), json={"accent": "#FF0000"}).status_code == 422
    )
    # Email/password changes are not done via this endpoint.
    assert (
        client.patch(ME, headers=auth_header(token), json={"email": "x@example.com"}).status_code
        == 422
    )


def test_delete_me_removes_the_account_and_all_its_data(
    client: TestClient, db: Session, register: Register
) -> None:
    body = register()
    token = body["access_token"]
    user = db.get(User, body["user"]["id"])
    assert user is not None
    db.add(
        Application(
            user_id=user.id,
            company="Careem",
            role_title="Junior Backend Engineer",
            status=ApplicationStatus.APPLIED,
            applied_on=date(2026, 11, 2),
        )
    )
    db.commit()

    response = client.delete(ME, headers=auth_header(token))

    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(Application)) == 0  # ON DELETE CASCADE
    assert db.scalar(select(func.count()).select_from(RefreshToken)) == 0

    # The still-unexpired access token no longer works, and the user can't log in.
    assert client.get(ME, headers=auth_header(token)).status_code == 401
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "ayesha.khan@example.com", "password": DEFAULT_PASSWORD},
    )
    assert login.status_code == 401
