"""Sign-up email domain check: reject only confirmed-undeliverable domains, fail open on
DNS trouble, and never look anything up outside registration. DNS is always faked.

Domains are fictional but use ordinary TLDs: email-validator treats special-use names
(.test, .example, .invalid, ...) as invalid syntax, so they'd never reach the DNS check.
"""

import logging
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings

# Imported before conftest swaps `get_resolver` for the fake, so this is the real factory.
from app.core.email_domain import UNDELIVERABLE_MESSAGE, domain_accepts_mail
from app.core.email_domain import get_resolver as real_get_resolver
from app.models import User
from tests.conftest import DEFAULT_PASSWORD
from tests.fake_dns import (
    MX,
    TXT,
    A,
    FakeResolver,
    dns_timeout,
    no_answer,
    no_nameservers,
    nxdomain,
)

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"


def register_body(email: str) -> dict[str, str]:
    return {"email": email, "password": DEFAULT_PASSWORD, "full_name": "Ayesha Khan"}


# ---------------------------------------------------------------- the check itself


def test_accepts_a_domain_with_mx_records(fake_dns: FakeResolver) -> None:
    fake_dns.answer(
        "mailbox-ok.com", "MX", [MX(10, "mx1.mailbox-ok.com."), MX(20, "mx2.mailbox-ok.com.")]
    )
    assert domain_accepts_mail("ayesha@mailbox-ok.com") is True
    assert fake_dns.queries == [("mailbox-ok.com", "MX")]


def test_accepts_a_domain_with_only_an_a_record(fake_dns: FakeResolver) -> None:
    fake_dns.answer("a-record-only.com", "MX", no_answer())
    fake_dns.answer("a-record-only.com", "A", [A("93.184.215.14")])
    assert domain_accepts_mail("ayesha@a-record-only.com") is True


def _nxdomain(f: FakeResolver) -> str:
    f.answer("gmial-typo.com", "MX", nxdomain())
    return "gmial-typo.com"


def _no_records(f: FakeResolver) -> str:
    f.answer("no-mail-records.com", "MX", no_answer())  # and no A / AAAA (fake default)
    return "no-mail-records.com"


def _null_mx(f: FakeResolver) -> str:
    f.answer("null-mx.com", "MX", [MX(0, ".")])
    return "null-mx.com"


def _spf_reject_all(f: FakeResolver) -> str:
    f.answer("spf-reject.com", "MX", no_answer())
    f.answer("spf-reject.com", "A", [A("93.184.215.14")])
    f.answer("spf-reject.com", "TXT", [TXT((b"v=spf1 -all",))])
    return "spf-reject.com"


@pytest.mark.parametrize(
    "setup",
    [_nxdomain, _no_records, _null_mx, _spf_reject_all],
    ids=["domain does not exist", "no MX/A/AAAA", "null MX (RFC 7505)", "SPF -all, no MX"],
)
def test_rejects_confirmed_undeliverable_domains(
    fake_dns: FakeResolver, setup: Callable[[FakeResolver], str]
) -> None:
    domain = setup(fake_dns)
    assert domain_accepts_mail(f"ayesha@{domain}") is False


@pytest.mark.parametrize(
    "error",
    [dns_timeout(), no_nameservers(), OSError("network is unreachable")],
    ids=["timeout", "no nameservers", "unexpected error"],
)
def test_fails_open_when_dns_itself_fails(
    fake_dns: FakeResolver, caplog: pytest.LogCaptureFixture, error: BaseException
) -> None:
    fake_dns.answer("flaky-dns.com", "MX", error)
    with caplog.at_level(logging.WARNING, logger="app.core.email_domain"):
        assert domain_accepts_mail("ayesha@flaky-dns.com") is True
    assert "allowing sign-up" in caplog.text


def test_leaves_syntax_to_schema_validation(fake_dns: FakeResolver) -> None:
    # Not reachable through the API (EmailStr rejects it first); the check doesn't judge it.
    assert domain_accepts_mail("not-an-email") is True
    assert fake_dns.queries == []


def test_real_resolver_uses_the_short_timeout_and_caches_answers() -> None:
    real_get_resolver.cache_clear()
    try:
        resolver = real_get_resolver()  # building it reads config; it sends no query
        assert resolver.lifetime == get_settings().email_dns_timeout_seconds == 3
        assert resolver.cache is not None
        assert real_get_resolver() is resolver  # one per process
    finally:
        real_get_resolver.cache_clear()


def test_can_be_switched_off(fake_dns: FakeResolver, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "email_domain_check_enabled", False)
    fake_dns.answer("gmial-typo.com", "MX", nxdomain())
    assert domain_accepts_mail("ayesha@gmial-typo.com") is True
    assert fake_dns.queries == []


# ---------------------------------------------------------------- through the API


def test_register_rejects_an_undeliverable_domain_on_the_email_field(
    client: TestClient, db: Session, fake_dns: FakeResolver
) -> None:
    fake_dns.answer("gmial-typo.com", "MX", nxdomain())

    response = client.post(REGISTER, json=register_body("ayesha@gmial-typo.com"))

    assert response.status_code == 422
    # Same shape as FastAPI's own validation errors, so the SPA maps it onto the field.
    assert response.json() == {
        "detail": [
            {
                "type": "value_error.email_undeliverable",
                "loc": ["body", "email"],
                "msg": UNDELIVERABLE_MESSAGE,
            }
        ]
    }
    assert db.scalar(select(User).where(User.email == "ayesha@gmial-typo.com")) is None


def test_register_still_works_when_dns_times_out(
    client: TestClient, fake_dns: FakeResolver
) -> None:
    fake_dns.answer("slow-dns.com", "MX", dns_timeout())
    response = client.post(REGISTER, json=register_body("bilal@slow-dns.com"))
    assert response.status_code == 201, response.text


def test_login_never_looks_up_dns(client: TestClient, fake_dns: FakeResolver) -> None:
    assert client.post(REGISTER, json=register_body("bilal@mailbox-ok.com")).status_code == 201
    fake_dns.queries.clear()

    response = client.post(
        LOGIN, json={"email": "bilal@mailbox-ok.com", "password": DEFAULT_PASSWORD}
    )

    assert response.status_code == 200
    assert fake_dns.queries == []


def test_tests_cannot_reach_real_dns() -> None:
    import dns.resolver

    with pytest.raises(AssertionError, match="Real DNS lookup attempted"):
        dns.resolver.resolve("example.org", "MX")
