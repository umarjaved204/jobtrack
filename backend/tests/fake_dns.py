"""An in-memory stand-in for dns.resolver.Resolver, for the sign-up email domain check.

Tests must never do real DNS lookups (CI may have no network, and answers change).
conftest.py installs a FakeResolver for every test; tests configure answers per domain.
"""

from dataclasses import dataclass, field
from typing import Any

import dns.exception
import dns.resolver


@dataclass(frozen=True)
class MX:
    preference: int
    exchange: str  # email-validator does str(exchange).rstrip(".")


@dataclass(frozen=True)
class A:
    address: str


@dataclass(frozen=True)
class TXT:
    strings: tuple[bytes, ...]


Answer = list[Any] | BaseException


# dnspython's exception constructors are untyped; build them in one place.
def nxdomain() -> BaseException:
    """The domain does not exist."""
    return dns.resolver.NXDOMAIN()  # type: ignore[no-untyped-call]


def no_answer() -> BaseException:
    """The domain exists but has no records of the requested type."""
    return dns.resolver.NoAnswer()  # type: ignore[no-untyped-call]


def dns_timeout() -> BaseException:
    return dns.exception.Timeout()  # type: ignore[no-untyped-call]


def no_nameservers() -> BaseException:
    return dns.resolver.NoNameservers()  # type: ignore[no-untyped-call]


@dataclass
class FakeResolver:
    """Answers `resolve(domain, rdtype)` from `answers`. Unlisted queries: every domain has
    one MX record (so ordinary sign-ups pass), and any other record type has no answer."""

    answers: dict[tuple[str, str], Answer] = field(default_factory=dict)
    queries: list[tuple[str, str]] = field(default_factory=list)

    def answer(self, domain: str, rdtype: str, answer: Answer) -> None:
        self.answers[(domain, rdtype)] = answer

    def resolve(self, qname: object, rdtype: str = "A", *_: object, **__: object) -> list[Any]:
        key = (str(qname).rstrip(".").lower(), rdtype)
        self.queries.append(key)
        if key in self.answers:
            result = self.answers[key]
        elif rdtype == "MX":
            result = [MX(10, "mx.mail-host.com.")]
        else:
            result = no_answer()
        if isinstance(result, BaseException):
            raise result
        return result
