from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, hash_refresh_token
from app.models import RefreshToken, User
from tests.conftest import DEFAULT_PASSWORD, auth_header

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/users/me"

Register = Callable[..., dict[str, Any]]


def login(client: TestClient, email: str = "ayesha.khan@example.com") -> Any:
    return client.post(LOGIN, json={"email": email, "password": DEFAULT_PASSWORD})


def refresh_with(client: TestClient, cookie_name: str, raw_token: str) -> Any:
    """Call /refresh presenting exactly this token (not whatever the cookie jar holds)."""
    client.cookies.clear()
    return client.post(REFRESH, headers={"Cookie": f"{cookie_name}={raw_token}"})


# --------------------------------------------------------------------------- register


def test_register_creates_account_and_logs_in(client: TestClient, refresh_cookie_name: str) -> None:
    response = client.post(
        REGISTER,
        json={
            "email": "Bilal.Ahmed@Example.com",
            "password": DEFAULT_PASSWORD,
            "full_name": "  Bilal Ahmed ",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["user"]["email"] == "bilal.ahmed@example.com"  # normalised
    assert body["user"]["full_name"] == "Bilal Ahmed"  # trimmed
    assert body["user"]["theme"] == "system"
    assert "password" not in str(body)

    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{refresh_cookie_name}=")
    assert "HttpOnly" in set_cookie
    assert "Path=/api/v1/auth" in set_cookie
    assert "SameSite=strict" in set_cookie

    me = client.get(ME, headers=auth_header(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


def test_register_rejects_duplicate_email_case_insensitively(
    client: TestClient, register: Register
) -> None:
    register(email="ayesha.khan@example.com")

    response = client.post(
        REGISTER,
        json={
            "email": "AYESHA.KHAN@example.com",
            "password": DEFAULT_PASSWORD,
            "full_name": "Someone Else",
        },
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists"}


def test_password_is_stored_hashed(db: Session, register: Register) -> None:
    register()

    user = db.scalars(select(User)).one()
    assert user.password_hash.startswith("$argon2id$")
    assert DEFAULT_PASSWORD not in user.password_hash


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"email": "not-an-email", "password": DEFAULT_PASSWORD, "full_name": "A"}, "email"),
        ({"email": "a@example.com", "password": "short", "full_name": "A"}, "password"),
        ({"email": "a@example.com", "password": "x" * 129, "full_name": "A"}, "password"),
        ({"email": "a@example.com", "password": DEFAULT_PASSWORD, "full_name": "   "}, "full_name"),
    ],
)
def test_register_validates_input(client: TestClient, payload: dict[str, str], field: str) -> None:
    response = client.post(REGISTER, json=payload)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


# --------------------------------------------------------------------------- login


def test_login_succeeds_with_any_email_casing(client: TestClient, register: Register) -> None:
    register()

    response = login(client, email="Ayesha.Khan@EXAMPLE.com")

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "ayesha.khan@example.com"


def test_wrong_password_and_unknown_email_look_identical(
    client: TestClient, register: Register
) -> None:
    register()

    wrong_password = client.post(
        LOGIN, json={"email": "ayesha.khan@example.com", "password": "not-my-password"}
    )
    unknown_email = client.post(
        LOGIN, json={"email": "nobody@example.com", "password": DEFAULT_PASSWORD}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert (
        wrong_password.json() == unknown_email.json() == {"detail": "Incorrect email or password"}
    )


# --------------------------------------------------------------------------- refresh


def _token_row(db: Session, raw: str) -> RefreshToken:
    return db.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    ).one()


def _age_revocation(db: Session, raw: str, seconds: int) -> None:
    """Pretend the token was revoked `seconds` ago (to step outside the grace window)."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .values(revoked_at=datetime.now(UTC) - timedelta(seconds=seconds))
    )


def test_database_stores_only_a_hash_of_the_refresh_token(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    register()
    raw = client.cookies[refresh_cookie_name]

    row = db.scalars(select(RefreshToken)).one()
    assert row.token_hash == hash_refresh_token(raw)
    assert raw not in {str(value) for value in vars(row).values()}


def test_refresh_rotates_the_token_within_the_same_family(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    register()
    original = client.cookies[refresh_cookie_name]

    response = client.post(REFRESH)

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "ayesha.khan@example.com"
    rotated = response.cookies[refresh_cookie_name]
    assert rotated != original
    assert _token_row(db, original).revoked_at is not None
    assert _token_row(db, rotated).revoked_at is None
    assert _token_row(db, rotated).family_id == _token_row(db, original).family_id
    assert client.get(ME, headers=auth_header(response.json()["access_token"])).status_code == 200


def test_each_login_starts_a_new_family(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    register()
    laptop = client.cookies[refresh_cookie_name]
    phone = login(client).cookies[refresh_cookie_name]

    assert _token_row(db, laptop).family_id != _token_row(db, phone).family_id


def test_reuse_inside_grace_window_is_rejected_without_revoking_the_family(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    """Two tabs refreshing at once: the loser gets 401, the winner's new token keeps working."""
    register()
    original = client.cookies[refresh_cookie_name]
    rotated = refresh_with(client, refresh_cookie_name, original).cookies[refresh_cookie_name]

    late_duplicate = refresh_with(client, refresh_cookie_name, original)

    assert late_duplicate.status_code == 401
    # Must not clear the cookie: in a browser that would delete the winner's new token.
    assert "set-cookie" not in late_duplicate.headers
    assert _token_row(db, rotated).revoked_at is None
    assert refresh_with(client, refresh_cookie_name, rotated).status_code == 200


def test_reuse_after_grace_window_revokes_only_that_family(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    register()
    laptop = client.cookies[refresh_cookie_name]
    phone = login(client).cookies[refresh_cookie_name]
    laptop_rotated = refresh_with(client, refresh_cookie_name, laptop).cookies[refresh_cookie_name]
    _age_revocation(db, laptop, seconds=11)

    # An attacker replays the stolen, long-rotated laptop token...
    replay = refresh_with(client, refresh_cookie_name, laptop)

    # ...which kills the laptop family (attacker and real laptop both re-authenticate)...
    assert replay.status_code == 401
    assert "Max-Age=0" in replay.headers["set-cookie"]  # dead session: cookie cleared
    assert _token_row(db, laptop_rotated).revoked_at is not None
    assert refresh_with(client, refresh_cookie_name, laptop_rotated).status_code == 401
    # ...while the phone, a separate login, is untouched.
    assert _token_row(db, phone).revoked_at is None
    assert refresh_with(client, refresh_cookie_name, phone).status_code == 200


def test_grace_window_is_configurable(
    client: TestClient,
    db: Session,
    register: Register,
    refresh_cookie_name: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "refresh_reuse_grace_seconds", 0)
    register()
    original = client.cookies[refresh_cookie_name]
    rotated = refresh_with(client, refresh_cookie_name, original).cookies[refresh_cookie_name]
    _age_revocation(db, original, seconds=1)

    assert refresh_with(client, refresh_cookie_name, original).status_code == 401
    assert _token_row(db, rotated).revoked_at is not None  # no grace: family revoked


def test_refresh_without_cookie_is_rejected(client: TestClient) -> None:
    response = client.post(REFRESH)

    assert response.status_code == 401


def test_expired_refresh_token_is_rejected_and_cookie_cleared(
    client: TestClient, db: Session, register: Register, refresh_cookie_name: str
) -> None:
    register()
    raw = client.cookies[refresh_cookie_name]
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )

    response = refresh_with(client, refresh_cookie_name, raw)

    assert response.status_code == 401
    assert response.json() == {"detail": "Session expired, please log in again"}
    assert "Max-Age=0" in response.headers["set-cookie"]


# --------------------------------------------------------------------------- logout


def test_logout_revokes_the_refresh_token(
    client: TestClient, register: Register, refresh_cookie_name: str
) -> None:
    register()
    raw = client.cookies[refresh_cookie_name]

    response = client.post(LOGOUT)

    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert refresh_with(client, refresh_cookie_name, raw).status_code == 401


def test_logout_without_session_is_a_no_op(client: TestClient) -> None:
    assert client.post(LOGOUT).status_code == 204


# --------------------------------------------------------------------------- access token


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic YXlzaGE6cGFzcw=="},
    ],
    ids=["missing", "garbage", "wrong-scheme"],
)
def test_protected_route_rejects_bad_credentials(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get(ME, headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_access_token_is_rejected(
    client: TestClient, db: Session, register: Register
) -> None:
    register()
    user = db.scalars(select(User)).one()
    expired = create_access_token(user.id, expires_delta=timedelta(seconds=-1))

    response = client.get(ME, headers=auth_header(expired))

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token"}
