# ADR 0002: Authentication with short-lived JWTs and rotating refresh cookies

- **Status:** Accepted (revised after the Phase 2 review: per-family reuse detection with a grace window; client implementation added in Phase 5)
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

## Client implementation (Phase 5)

Code: `frontend/src/lib/api/session.ts` (session manager), `frontend/src/lib/api/client.ts`
(fetch wrapper), `frontend/src/features/auth/` (session query, guards, forms, sign-out handler).

### Token lifecycle

- The access token lives **only in memory** (a module per tab). It is never written to
  localStorage, sessionStorage or a readable cookie. The only auth-adjacent values in
  localStorage are the theme and accent cache read by `index.html` before React mounts.
- On page load the SPA restores the session with **one** `POST /auth/refresh`: the response
  carries `{access_token, expires_in, user}`, so no `GET /users/me` follows.
- **Proactive refresh** is scheduled from when the response *arrived*, using `expires_in` and a
  monotonic clock (`performance.now()`): 60 s before expiry, or a quarter of the lifetime for
  very short tokens. The client never parses the JWT or compares `exp` with the device clock,
  so a wrong or changing system clock can't break it.
- Requests also check before sending: a token within the margin is refreshed first. A `401` on
  a normal API call refreshes once and retries once; a second `401` ends the session.
- `/auth/login`, `/auth/register`, `/auth/refresh` and `/auth/logout` **never** get the bearer
  token or the refresh-and-retry logic: their `401`s mean "wrong password" or "no session".

### Cross-tab coordination (resolves the open item below)

Tabs share one cookie jar, and every refresh rotates the cookie. Two tabs refreshing at once
would present the same cookie; the backend lets one win and answers the other with the
grace-window `401` (see above).

1. **Web Locks:** each refresh runs inside `navigator.locks.request('jobtrack:auth-refresh', …)`.
   Locks are scoped to the origin and shared by all its tabs and workers, so refreshes are
   serialised: a tab that waited sends the cookie the previous holder just stored, and its
   rotation succeeds. Inside one tab, concurrent callers share a single in-flight request.
   *Verified on MDN (2026-11):* Baseline "widely available" since March 2022; `request()`
   resolves with the callback's result; exclusive mode by default.
2. **Secure contexts only:** `navigator.locks` exists only on HTTPS and `localhost`. Testing
   from another device over a LAN IP (`http://192.168.x.x:5173`) is an insecure context, so the
   app runs **without** locks there, using the fallback below. That is expected, not a bug.
3. **Fallback, and why "retry once" exists:** without locks, the losing tab gets a `401` whose
   body (`"Session expired, please log in again"`) is identical to a dead session's, and the
   only difference (the dead-session response clears the cookie) is a `Set-Cookie` header that
   JavaScript cannot read. So any refresh `401` *except* "no cookie at all" is retried once
   after 400 ms, by which time the winner's cookie is in the jar. A second `401` means signed
   out. If the response was truly lost (rare), the user signs in again, as the backend design
   intends.
4. **"No cookie" is not retried:** the backend answers a refresh without a cookie with
   `"detail": "Not authenticated"`, and a race is impossible without a cookie, so it maps
   straight to *anonymous* (first-time visitors don't wait 400 ms).
   **Coupling:** the client matches these two `detail` strings (named constants in
   `session.ts`). If either changes, the client falls back to the safe path (retry once);
   only the 400 ms optimisation is lost. A machine-readable error code would remove the
   coupling; it's a backend change, deferred.
5. **Sign-out broadcast:** signing out (button, failed refresh, or account deletion later)
   posts `{type: 'signed-out'}` on a `BroadcastChannel`. Every tab that was signed in clears
   its token **and its TanStack Query cache** (which may hold the previous user's data) and
   navigates to `/login`. Tabs that were anonymous ignore it.

### Why Lighthouse reports a console error for anonymous visitors

Every first visit without a session makes one `POST /api/v1/auth/refresh`, which returns
`401 {"detail": "Not authenticated"}`. Browsers log any 4xx response as a console error, so
Lighthouse's *Best practices* check ("no browser errors logged") marks it, capping that score
at 96. This is **by design**: the refresh cookie is httpOnly, so JavaScript cannot tell whether
a session exists without asking the server. The landing page no longer waits for this call
(it renders immediately and swaps its calls to action when the session resolves), so it costs
no rendering time. Decision (2026-11-17): keep it, no backend change.

*Possible later improvement (not planned):* the backend could also set a non-httpOnly
`has_session=1` hint cookie (no secret in it) alongside the refresh cookie, and clear it on
logout or refresh failure. The SPA would skip the refresh call when the hint is absent. The
cost is a second cookie to keep consistent with the real one; if the two disagree, the result
is only an extra or a skipped (then retried) call, never a security issue.

### Routing and forms

- Route loaders gate pages before render: protected pages redirect to `/login?next=…`;
  `/`, `/login` and `/register` forward signed-in users. A `401` from refresh on first load
  means *anonymous*; network or server errors are not sign-outs (protected pages show an
  error, auth pages still render the form).
- `?next=` is validated by `safeNextPath`: only same-origin relative paths starting with a
  single `/`. Protocol-relative `//`, backslashes, absolute and `javascript:`/`data:` URLs and
  control characters fall back to `/dashboard` (no open redirect after sign-in).
- Login shows **one** message for unknown email and wrong password, matching the backend's
  anti-enumeration rule. `429` shows the wait from `Retry-After` and disables the submit button
  until it ends.

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
| Login/register rate limiting | Done (verify client IP before the public deploy) | Backend limiter in Phase 3 (in-process; fine for one Render instance). UI handling of `429` (Retry-After countdown) in Phase 5 |
| Cross-tab refresh coordination | Done (Phase 5) | Web Locks + in-tab sharing, retry-once fallback; see *Client implementation* |
| Email verification + password reset | **Planned: Phase 12** (before deploy) | See *Planned: email verification and password reset* below |
| Email domain check at sign-up (MX) | Planned: small backend branch after the frontend audit fixes | Register only, fail open on DNS errors, mocked DNS in tests |
| Machine-readable auth error codes | Optional | Would remove the client's match on two `detail` strings (see *Coupling*) |

## Planned: email verification and password reset (Phase 12)

Agreed scope, recorded here so the design is fixed before the phase starts. The email
provider is chosen in that phase.

- **Tokens:** random, single-use, short expiry; only `sha256(token)` is stored (same pattern
  as refresh tokens). Separate purposes (verify email, reset password) never accept each
  other's tokens.
- **Endpoints are rate-limited** like login/register.
- **Reset request never reveals whether an account exists:** the same response and similar
  timing for known and unknown emails.
- **A successful reset revokes all of the user's refresh-token families**, signing out every
  device. The user signs in again with the new password.
- **Verification is non-blocking:** the app works before verifying; a banner asks the user to
  verify (with resend, rate-limited).
- **No emails for seed/demo accounts.**
