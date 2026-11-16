"""Password hashing, JWT access tokens and opaque refresh tokens.

- Passwords: Argon2id via pwdlib's recommended settings.
- Access token: short-lived JWT (HS256) signed with JWT_SECRET_KEY, kept in memory by the SPA.
- Refresh token: random opaque string in an httpOnly cookie. Only its SHA-256 hash is
  stored, so a database leak can't be replayed. It doesn't need to be a JWT: the database
  row is the source of truth (expiry, revocation), and a signature would add nothing.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_password_hash = PasswordHash.recommended()

# Verified against when the email doesn't exist, so "unknown email" and "wrong password"
# take the same time and can't be told apart (prevents account enumeration by timing).
_DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Returns (is_valid, new_hash). `new_hash` is set when hashing parameters were upgraded
    since the hash was created, and should be saved."""
    return _password_hash.verify_and_update(password, password_hash)


def burn_password_check_time(password: str) -> None:
    _password_hash.verify(password, _DUMMY_HASH)


class InvalidAccessTokenError(Exception):
    pass


def create_access_token(user_id: uuid.UUID, *, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload = {"sub": str(user_id), "type": "access", "iat": now, "exp": expires}
    return jwt.encode(
        payload, settings.jwt_secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )


def decode_access_token(token: str) -> uuid.UUID:
    """Return the user id, or raise InvalidAccessTokenError (bad signature/expired/malformed)."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if payload["type"] != "access":
            raise InvalidAccessTokenError("wrong token type")
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise InvalidAccessTokenError(str(exc)) from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # A fast hash is fine here (unlike passwords): the token has 256 bits of entropy.
    return hashlib.sha256(token.encode()).hexdigest()
