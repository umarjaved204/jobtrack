# Architecture

_Filled in as the system takes shape; a diagram arrives in Phase 13._

## Request flow

### Production

```
Browser
  │  https://<app>.vercel.app/...           (one origin for the SPA and the API)
  ▼
Vercel edge ── static files (SPA, index.html fallback for client routes)
  │  /api/*  (vercel.json rewrite to an external origin; the browser never sees Render)
  │  sets X-Forwarded-For = <browser IP>                       ⚠ expected: verify (1)
  ▼
Render load balancer
  │  appends the IP it received the request from (a Vercel egress IP)  ⚠ verify (1)
  │  X-Forwarded-For: <browser IP>, <vercel IP>
  ▼
uvicorn (--proxy-headers --forwarded-allow-ips='*') ──► FastAPI
  │  request.client.host := LEFTMOST X-Forwarded-For entry    ✔ checked in uvicorn's source
  ▼
Neon PostgreSQL: pooled endpoint for the app, direct endpoint for Alembic migrations
```

Same-origin means the refresh cookie is first-party (`SameSite=Strict` works) and the API
needs no CORS in production.

**Who sets `X-Forwarded-For`, and why it matters.** The rate limiter keys on
`request.client.host`. With `--forwarded-allow-ips='*'`, uvicorn trusts every hop and
returns the **leftmost** entry, which is exactly the one a client can forge. That's only
safe if Vercel **overwrites** any client-supplied `X-Forwarded-For` with the real browser IP.

(1) Not yet verified: Vercel's and Render's exact header behaviour. Test after the first
deploy (Phase 13): send `X-Forwarded-For: 1.2.3.4` to the deployed login endpoint
repeatedly. If the limit doesn't trigger, the header is spoofable; fix it by restricting
`--forwarded-allow-ips` or by keying on a platform header that clients can't set.
Details: [deployment.md](./deployment.md#client-ip-for-rate-limiting).

### Local development

```
Browser ──► Vite dev server :5173 ── /api/* proxy ──► FastAPI :8000 ──► Postgres (Docker)
```

The Vite proxy plays Vercel's role, so the app is same-origin in dev too. No
`X-Forwarded-For` is involved: every request reaches FastAPI from the Vite process.

## Domain enums

Python `StrEnum`s in `backend/app/models/enums.py` are the single source of truth. They're
stored as `VARCHAR(20)` + `CHECK` constraints; changing them needs a hand-written migration.

| Enum | Column(s) | Values |
|---|---|---|
| `ApplicationStatus` | `applications.status`, `application_events.from_status` / `to_status` | `wishlist`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn` |
| `WorkMode` | `applications.work_mode` (nullable) | `remote`, `hybrid`, `onsite` |
| `EventType` | `application_events.type` | `status_change`, `note` |
| `CalendarEventKind` | `calendar_events.kind` | `interview`, `assessment`, `deadline`, `other` |
| `ThemePreference` | `users.theme` | `light`, `dark`, `system` (default) |

Not enums (validated free text):
- `applications.source`: 1–50 chars, e.g. "LinkedIn"; list filters match it case-insensitively.
- `users.accent`, `tags.color`: palette colour **names** matching `^[a-z][a-z-]{0,19}$`
  (defaults `vermilion` / `ink`). The allowed names get pinned to the design tokens in Phase 4.

## Backend layering

`router → service → model`: routers handle HTTP concerns, services hold business logic
and own the SQLAlchemy session work, models are SQLAlchemy 2.0 mapped classes.
There's no repository layer: SQLAlchemy already abstracts the database.

## Authentication

Short-lived JWT access token (memory) + rotating opaque refresh token (httpOnly cookie scoped to
`/api/v1/auth`). Full rationale: [ADR 0002](./adr/0002-authentication.md).

```
login/register ──► { access_token, user }  +  Set-Cookie: jobtrack_refresh (httpOnly)
API call       ──► Authorization: Bearer <access_token>
401 / reload   ──► POST /auth/refresh (cookie) ──► new access token + rotated cookie (same family)
```

Re-presenting a rotated token after a 10 s grace window revokes that login's token family only.

## Applications page (frontend)

- **Server state**: TanStack Query, keys in `features/applications/api.ts`. The board
  (`GET /applications/board`) and the paged table (`GET /applications?…`) are separate
  queries; every mutation invalidates the views that could show the change.
- **Board moves** are optimistic with midpoint positions; see
  [ADR 0003](./adr/0003-kanban-drag-and-drop.md).
- **URL as state**: `/applications?view=table&q=…&status=…&sort=…&page=…` is parsed per
  param with Zod, so a hand-edited or stale URL degrades to defaults instead of erroring.
- **Detail page** (`/applications/:id`): application, timeline (`/events`) and contacts are
  three queries, so each section loads and fails independently.

## Dashboard metrics

Endpoints: `GET /api/v1/analytics/summary|funnel|sources|timeseries?from&to`
(`app/services/analytics.py`). The dashboard reads them plus the board.

**Cohort.** Every range-scoped figure is computed over one cohort: the user's applications
whose `applied_on` falls in `[from, to]` (inclusive; either end may be open). With no range,
every application that has an `applied_on`. The range picker (30 days, 90 days, all time)
computes `from`/`to` from the **browser's** calendar day, so it never depends on the
server's UTC date.

**Stages reached.** Applied < Screening < Interview < Offer. An application's furthest
stage comes from its timeline (`status_change` events) plus its current status, not the
current status alone, so a role rejected after an interview still counts as interviewed.
Reaching a stage counts every stage before it (a move from Applied straight to Interview
counts as Screening too). Rejected and Withdrawn are outcomes, not stages.

- A role moved from the wishlist straight to Withdrawn gets an `applied_on` (leaving the
  wishlist fills it in) but never reached Applied, so it is left out of every count.
- **Trade-off:** a mistaken move to a later stage that is moved back still counts as
  reached. The history can't tell a mistake from a real step.

**Stat strip** (`summary`):

| Figure | Definition |
| --- | --- |
| Applied | Cohort applications that reached Applied or later |
| Active | Cohort applications now in Applied, Screening, Interview or Offer |
| Interview rate | Reached Interview or later ÷ Applied, shown with its counts ("6 of 35") |
| Offers | Reached Offer; offer rate = Offers ÷ Applied |
| Wishlist | Applications on the wishlist now. **Ignores the range** (they have no `applied_on`) |

**Rates** are fractions in [0, 1], or `null` when the denominator is 0; the UI shows "—"
(read out as "Not enough data"), never 0%.

**Funnel** (`funnel`): for each stage, how many cohort applications reached it or a later
one, and `rate_from_previous` (count ÷ the previous stage's count; `null` for Applied or when
the previous stage is 0). The first bar is the same cohort as the Applied figure.

**Sources** (`sources`): cohort applications that reached Applied, grouped by source
case-insensitively (`source` is free text, not an enum) and labelled with the most common
spelling; no source is `null` ("Not set"). Each row: applied, interviewed, interview rate.
Rates from fewer than 5 applications are shown italic with an asterisk and a footnote.

**Over time** (`timeseries`): cohort applications that reached Applied, counted by
`applied_on` into ISO weeks (Monday start), or calendar months when the range spans more
than 26 weeks (182 days). Buckets are zero-filled across the whole range; an open end is
taken from the data. The bucket holding today is drawn lighter and labelled "so far".

**Coming up** (computed in the browser, `features/dashboard/coming-up.ts`, from the board,
the open reminders and the calendar feed; not an analytics endpoint). All against the
browser's calendar day and clock ("today", "now"), never the server's UTC date.

- *Window:* today through today + 13 days ("Next 14 days").
- *Apply-by dates:* `deadline_on` of roles **on the wishlist only**. Once applied, the
  date needs no action. Missed when the date is before today.
- *Follow-up reminders* (open only): an all-day one is due on its date and overdue from
  the next local day; a timed one is overdue once its time has passed (so earlier today
  counts). Done reminders never show.
- *Events:* kinds `interview`, `assessment` and `deadline` (not `other`) that overlap the
  window and haven't ended (`ends_at`, or `starts_at` if there's no end). One that has
  started but not ended (a take-home window) is listed today. Events are never overdue.
- *Overdue:* missed apply-by dates and overdue reminders, oldest first. Those from the last
  30 days are listed; older ones are summarised as "+N older".
- *Order within a day:* all-day items first, then by time, then by title. Each group shows
  five, then "And N more".

**Motion and accessibility.** Counters (NumberFlow) animate on first load and range
changes only, never on background refetches, and not at all under reduced motion. Every
chart has a caption summary and a visually hidden data table.

## Health checks

- `GET /api/v1/health`: liveness, process only (used by Docker healthchecks).
- `GET /api/v1/health/ready`: readiness, runs `SELECT 1` (503 if the DB is unreachable).

See [`adr/`](./adr) for recorded decisions.
