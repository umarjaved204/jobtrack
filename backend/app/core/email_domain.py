"""Can an email's domain receive mail? Checked once, at sign-up (see ADR 0002).

Built on email-validator's deliverability check, with two deliberate differences:

* **Fail open.** email-validator reports a DNS timeout or "no nameservers" as unknown (no
  error), but it *also* raises EmailUndeliverableError for any unexpected exception (e.g. a
  network error). We only reject a *confirmed* answer: NXDOMAIN, no MX/A/AAAA records, a
  null MX (RFC 7505) or an SPF "-all" with no MX. Those are raised either directly (cause
  None) or chained from NXDOMAIN / NoAnswer; anything else means our DNS failed, not the
  domain, and the sign-up goes through (logged).
* **Our own resolver.** Without one, email-validator uses a 15 s timeout and changes
  dnspython's process-wide default resolver. We pass a cached resolver with a short timeout.

Login and every other endpoint never call this: Pydantic's EmailStr always passes
check_deliverability=False, so only the register flow does DNS.
"""

import logging
from functools import lru_cache

import dns.resolver
from email_validator import EmailNotValidError, EmailUndeliverableError, validate_email
from email_validator.deliverability import caching_resolver, validate_email_deliverability

from app.core.config import get_settings

logger = logging.getLogger(__name__)

UNDELIVERABLE_MESSAGE = "That email domain does not accept mail. Check it for typos."

# Causes that mean the domain itself answered "no mail here".
_CONFIRMED_UNDELIVERABLE = (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer)


@lru_cache(maxsize=1)
def get_resolver() -> dns.resolver.Resolver:
    """One cached resolver per process (answers are cached too, LRU). Tests replace this."""
    return caching_resolver(timeout=get_settings().email_dns_timeout_seconds)


def domain_accepts_mail(email: str) -> bool:
    """False only when DNS confirms the domain can't receive mail; True otherwise."""
    if not get_settings().email_domain_check_enabled:
        return True
    try:
        # Syntax was already validated by the request schema; this gives us the ASCII domain.
        parsed = validate_email(email, check_deliverability=False)
    except EmailNotValidError:
        return True  # not ours to judge here; schema validation owns syntax

    try:
        info = validate_email_deliverability(
            parsed.ascii_domain, parsed.domain, dns_resolver=get_resolver()
        )
    except EmailUndeliverableError as exc:
        cause = exc.__cause__
        if cause is None or isinstance(cause, _CONFIRMED_UNDELIVERABLE):
            return False
        logger.warning(
            "Email domain check errored for %s; allowing sign-up (%s: %s)",
            parsed.domain,
            type(cause).__name__,
            cause,
        )
        return True

    if "unknown-deliverability" in info:
        logger.warning(
            "Email domain check inconclusive for %s (%s); allowing sign-up",
            parsed.domain,
            info["unknown-deliverability"],
        )
    return True
