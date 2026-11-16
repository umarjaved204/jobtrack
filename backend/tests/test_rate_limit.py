from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import RateLimitedError
from app.core.rate_limit import Limit, SlidingWindowLimiter
from tests.conftest import DEFAULT_PASSWORD

LOGIN = "/api/v1/auth/login"
REGISTER = "/api/v1/auth/register"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


# --------------------------------------------------------------------------- unit


def test_allows_up_to_the_limit_then_blocks_with_retry_after() -> None:
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    limit = Limit(max_requests=3, window_seconds=60)

    for _ in range(3):
        limiter.hit("login:ip:203.0.113.7", limit)
        clock.now += 1

    with pytest.raises(RateLimitedError) as blocked:
        limiter.hit("login:ip:203.0.113.7", limit)
    assert blocked.value.headers == {"Retry-After": "57"}  # first hit expires at t+60


def test_window_slides_so_old_hits_expire() -> None:
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    limit = Limit(max_requests=2, window_seconds=60)
    limiter.hit("k", limit)
    clock.now += 30
    limiter.hit("k", limit)

    clock.now += 31  # the first hit is now outside the window
    limiter.hit("k", limit)

    with pytest.raises(RateLimitedError):
        limiter.hit("k", limit)


def test_keys_are_independent() -> None:
    limiter = SlidingWindowLimiter(FakeClock())
    limit = Limit(max_requests=1, window_seconds=60)

    limiter.hit("login:ip:203.0.113.7", limit)
    limiter.hit("login:ip:198.51.100.23", limit)  # different client: fine


def test_rejected_attempts_do_not_extend_the_block() -> None:
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    limit = Limit(max_requests=1, window_seconds=10)
    limiter.hit("k", limit)
    for _ in range(5):  # hammering while blocked...
        clock.now += 1
        with pytest.raises(RateLimitedError):
            limiter.hit("k", limit)

    clock.now += 5  # ...doesn't delay recovery past the original window
    limiter.hit("k", limit)


# --------------------------------------------------------------------------- API


@pytest.fixture
def tight_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_auth_per_ip", 3)
    monkeypatch.setattr(settings, "rate_limit_login_per_email", 2)


@pytest.mark.usefixtures("tight_limits")
def test_login_is_limited_per_email(
    client: TestClient, register: Callable[..., dict[str, Any]]
) -> None:
    register()
    attempt = {"email": "ayesha.khan@example.com", "password": "guess-number-n"}

    statuses = [client.post(LOGIN, json=attempt).status_code for _ in range(3)]

    assert statuses == [401, 401, 429]
    blocked = client.post(LOGIN, json=attempt | {"password": DEFAULT_PASSWORD})
    assert blocked.status_code == 429  # even the right password, until the window passes
    assert int(blocked.headers["retry-after"]) > 0
    assert blocked.json() == {"detail": "Too many attempts, please try again later"}


@pytest.mark.usefixtures("tight_limits")
def test_register_is_limited_per_ip(client: TestClient) -> None:
    statuses = [
        client.post(
            REGISTER,
            json={
                "email": f"signup{i}@example.com",
                "password": DEFAULT_PASSWORD,
                "full_name": "Sign Up",
            },
        ).status_code
        for i in range(4)
    ]

    assert statuses == [201, 201, 201, 429]


@pytest.mark.usefixtures("tight_limits")
def test_limits_can_be_disabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    attempt = {"email": "nobody@example.com", "password": "guess"}

    statuses = {client.post(LOGIN, json=attempt).status_code for _ in range(5)}

    assert statuses == {401}
