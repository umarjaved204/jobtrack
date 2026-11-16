"""Registration, login and refresh-token lifecycle (issue, rotate, revoke)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import (
    burn_password_check_time,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import RegisterRequest

INVALID_CREDENTIALS = "Incorrect email or password"
INVALID_REFRESH = "Session expired, please log in again"


class RefreshRaceError(UnauthorizedError):
    """A just-rotated token was presented again (concurrent tabs / retried request).

    Distinct from other refresh failures because the browser's cookie must be left
    alone: it may already hold the newer token from the request that won the race.
    """


def register_user(db: Session, data: RegisterRequest) -> User:
    if db.scalar(select(User.id).where(User.email == data.email)) is not None:
        raise ConflictError("An account with this email already exists")

    user = User(
        email=data.email, password_hash=hash_password(data.password), full_name=data.full_name
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:  # two concurrent sign-ups with the same email
        db.rollback()
        raise ConflictError("An account with this email already exists") from exc
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        burn_password_check_time(password)
        raise UnauthorizedError(INVALID_CREDENTIALS)

    valid, upgraded_hash = verify_password(password, user.password_hash)
    if not valid:
        raise UnauthorizedError(INVALID_CREDENTIALS)
    if upgraded_hash is not None:
        user.password_hash = upgraded_hash
        db.commit()
    return user


def issue_refresh_token(db: Session, user: User, *, family_id: uuid.UUID | None = None) -> str:
    """Create a refresh token and return the raw value (for the cookie).

    No `family_id` means a new login, so a new family starts. Rotation passes the old
    token's family_id so the whole chain of tokens can be revoked together.
    """
    raw = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or uuid.uuid4(),
            token_hash=hash_refresh_token(raw),
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_expire_days),
        )
    )
    db.commit()
    return raw


def rotate_refresh_token(db: Session, raw: str) -> tuple[User, str]:
    """Exchange a valid refresh token for a new one in the same family (the old one is revoked).

    Presenting an already-revoked token:
    - revoked within the grace window: almost certainly a benign race (two tabs refreshing
      at once, or a retry after the response was lost). Reject it, revoke nothing.
    - revoked earlier: treat as theft. We can't tell attacker from user, so the whole
      family (that one login session) is revoked; the user's other sessions are untouched.
    """
    now = datetime.now(UTC)
    # FOR UPDATE: two simultaneous refreshes with the same token are serialised,
    # so only one can succeed.
    token = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .with_for_update()
    )
    if token is None:
        raise UnauthorizedError(INVALID_REFRESH)

    if token.revoked_at is not None:
        grace = timedelta(seconds=get_settings().refresh_reuse_grace_seconds)
        if now - token.revoked_at <= grace:
            raise RefreshRaceError(INVALID_REFRESH)
        _revoke_family(db, token.family_id, now)
        db.commit()
        raise UnauthorizedError(INVALID_REFRESH)

    if token.expires_at <= now:
        raise UnauthorizedError(INVALID_REFRESH)

    user = db.get(User, token.user_id)
    if user is None:  # unreachable thanks to ON DELETE CASCADE, but keeps types honest
        raise UnauthorizedError(INVALID_REFRESH)

    token.revoked_at = now
    # Commits the revocation and the new token together.
    return user, issue_refresh_token(db, user, family_id=token.family_id)


def revoke_refresh_token(db: Session, raw: str) -> None:
    """Logout. Idempotent: unknown or already-revoked tokens are ignored."""
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_refresh_token(raw),
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    db.commit()


def _revoke_family(db: Session, family_id: uuid.UUID, now: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
