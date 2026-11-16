# ADR 0002: Authentication with short-lived JWTs and rotating refresh cookies

- **Status:** Accepted (revised after the Phase 2 review: per-family reuse detection with a grace window)
- **Date:** 2026-11-16

## Context

The SPA and API are same-origin (Vite proxy in dev, Vercel rewrite in prod). We want
sessions that survive a page reload, without putting long-lived credentials where
JavaScript (and therefore an XSS bug) can read them.

## Decision

| Piece | Choice | Why |
|---|---|---|
| Access token | JWT (HS256, PyJWT), 15 min, kept **in memory** by the SPA | Stateless check on every request; short life limits damage if leaked |
| Refresh token | **Opaque** random 256-bit string, 30 days, `httpOnly; SameSite=Strict; Path=/api/v1/auth` cookie | JS can't read it; it's only sent to auth endpoints |
| Storage | Only `sha256(token)` in `refresh_tokens.token_hash`, never the raw value | A database leak can't be replayed |
| Families | Each login starts a new `family_id`; rotation keeps it | Lets us revoke one session (device) without touching others |
| Rotation | Every `/auth/refresh` revokes the presented token and issues a new one in the same family | Stolen tokens have a short useful life |
| Reuse detection | Presenting a token revoked **more than 10 s ago** (`REFRESH_REUSE_GRACE_SECONDS`) revokes **that family only** | Likely theft: attacker and victim of that session both re-authenticate |
| Grace window | Presenting a token revoked **within** the window → `401`, nothing revoked, **cookie left untouched** | See below |
| Passwords | Argon2id via `pwdlib` (`PasswordHash.recommended()`), rehash-on-login when params change | Current OWASP recommendation; passlib is unmaintained |
| Login errors | Same message and similar timing for unknown email vs wrong password | Prevents account enumeration |

The refresh token is deliberately **not** a JWT: the database row is the source of truth
for expiry and revocation, so a signature would add complexity without adding security.

### Why "401 without revoking" inside the grace window

A token re-presented seconds after rotation is almost always a race: two tabs refreshing
at once, or a retry after the response was lost. Rejecting it is enough, because the cookie
jar is shared between tabs, so the winner's new cookie is already what the browser sends
next. Handing out another token instead would also hand one to an attacker who acts
within the window, and revoking would log out a legitimate user.
The race `401` deliberately sends **no** `Set-Cookie`: clearing the cookie would delete the
newer token the winning request just stored in the shared cookie jar. The cost: a client that
truly lost the rotation response has to log in again, which is rare and safe.

## Consequences

- Concurrent refreshes are serialised with `SELECT … FOR UPDATE`, so only one can win.
- Logging out of one device doesn't invalidate access tokens already issued elsewhere;
  they expire within 15 minutes.
- Revoked/expired `refresh_tokens` rows accumulate; a periodic cleanup can be added later.
- Enums (e.g. `theme`) are VARCHAR + CHECK constraints generated from the Python `StrEnum`
  (the single source of truth). **Alembic autogenerate does not detect CHECK-constraint
  changes**, so adding an enum value needs a hand-written migration (drop + recreate the
  `ck_<table>_<name>` constraint). `alembic check` and `tests/test_migrations.py` will not catch it.

## Roadmap for open items

| Item | Status | When |
|---|---|---|
| Login/register rate limiting | **Required before the public deploy** | Backend limiter in Phase 3 (small, in-process; fine for one Render instance), UI handling of `429` in Phase 5 |
| Cross-tab refresh coordination | Planned | Phase 5 frontend: one in-flight refresh per browser. Likely approach: the Web Locks API (`navigator.locks.request`), to be verified then |
| Password change / reset | Optional | Not scheduled |
| Email verification | Known limitation | Not planned |
