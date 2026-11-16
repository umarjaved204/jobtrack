import uuid
from datetime import timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.security import (
    InvalidAccessTokenError,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("s3cure-Passphrase")

    assert hashed.startswith("$argon2id$")
    assert verify_password("s3cure-Passphrase", hashed)[0] is True
    assert verify_password("wrong-passphrase", hashed)[0] is False


def test_same_password_hashes_differently_each_time() -> None:
    assert hash_password("s3cure-Passphrase") != hash_password("s3cure-Passphrase")


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()

    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_access_token_is_rejected() -> None:
    token = create_access_token(uuid.uuid4(), expires_delta=timedelta(seconds=-1))

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token)


def test_token_signed_with_another_key_is_rejected() -> None:
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "iat": 0, "exp": 9_999_999_999},
        "attacker-controlled-secret-of-sufficient-length",
        algorithm="HS256",
    )

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(forged)


def test_token_of_wrong_type_is_rejected() -> None:
    settings = get_settings()
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "refresh", "iat": 0, "exp": 9_999_999_999},
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token)


def test_token_with_alg_none_is_rejected() -> None:
    unsigned = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "iat": 0, "exp": 9_999_999_999},
        key=None,
        algorithm="none",
    )

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(unsigned)


def test_refresh_tokens_are_random_and_stored_hashed() -> None:
    first, second = generate_refresh_token(), generate_refresh_token()

    assert first != second
    assert hash_refresh_token(first) == hash_refresh_token(first)
    assert hash_refresh_token(first) != first
    assert len(hash_refresh_token(first)) == 64
