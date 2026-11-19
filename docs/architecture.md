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

## Resume versions, reminders and the calendar

**Resume versions** record what was sent. A version is *in use* once an application links
to it or a match result was made with it. In use: the text is frozen (edit the label, or
duplicate it as a new version) and it can't be deleted, only archived. Archived versions
are hidden from the application form's picker and can't be the default, but applications
that used one keep showing it, marked "(archived)". One default per user. The
`match_results` foreign key is `NO ACTION`, so the database refuses to delete a resume that
has match history (`RESTRICT` would also block deleting an account, since it's checked
mid-cascade).

**Reminders** are in-app only (no email or push). Each is either *all-day* (`due_on`, a
date) or *timed* (`due_at`, an instant), never both. An all-day reminder is due on its date
in whatever zone the user is in, and overdue from the next local day; a timed one is
overdue once its moment has passed. Deleting an application deletes its reminders and
calendar events (the confirmation says how many).

**Calendar** (`GET /calendar?from&to`): one list of typed items.

- `event`: interviews, assessments, deadlines (offer replies, documents: not apply-by)
  and other events. Always timed. Included when they *overlap* the half-open range
  `[from, to)`: they start before `to` and either end after `from` or start at or after it.
  So overnight and multi-day events show on each day they touch, and one ending at exactly
  00:00 doesn't spill into the next day.
- `apply_by`: `deadline_on` of wishlist applications (the same rule as "Coming up").
- `reminder`: open reminders (`include_done=true` adds done ones). All-day ones carry
  `date`, timed ones `starts_at`.

`from` and `to` carry the client's UTC offsets (a Chicago month in March 2027 is
`2027-03-01T00:00:00-06:00` to `2027-04-01T00:00:00-05:00`). Date-only items are matched to
the calendar days those offsets name, so they never go through UTC. The range can be at
most 366 days. The month grid starts weeks on Monday, like the dashboard's ISO weeks.

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

## Match scoring

How a resume is scored against a job description (JD). The decision and its trade-offs are
in [ADR 0004](./adr/0004-resume-matching-local-embeddings.md). Code: `app/services/match/`.

**Formula** (`scoring.py`):

    score = 100 × (0.6 × skill coverage + 0.4 × semantic)    if the JD names taxonomy skills
    score = 100 × semantic                                    if it names none

The score is rounded to a whole number. It estimates overlap. It doesn't predict how an
employer or an ATS would rank the resume.

- *Skill coverage* (`skills.py`): requirements met / requirements found, with preferred
  ones counting half. Skills come from the curated taxonomy (`skills.json`). A list of
  alternatives on one line ("FastAPI, Django or Flask", "Power BI or Tableau", "React/Vue",
  "Express, NestJS or similar") is one requirement that any option meets. Lists joined
  only by commas or "and" are separate requirements. Required, preferred and ignored parts
  of the JD come from its headings and markers (`sections.py`).
- *Raw similarity* (`semantic.py`): both texts are chunked under the model's token limit.
  Each JD chunk takes its most similar resume chunk (cosine, "max-sim"). The raw value is
  the weighted mean of those maxima, with preferred lines at half weight.
- *Semantic*: the raw similarity, calibrated per model (below), from 0 to 1.

**Calibration.** On bge models, raw cosines bunch in a narrow band: 0.59 to 0.75 on our
pairs, whether the texts are unrelated or a perfect fit. So they're mapped linearly onto
0 to 1 and clipped. The two anchors are the raw values where a least-squares line of
*grade / 3* on raw similarity crosses 0 and 1.

- *Labelled set* (`backend/scripts/calibration_data/`): 6 invented resumes × 6 invented JDs
  (backend, frontend, full-stack, data analyst, content marketing, ward nurse), 36 pairs.
  Each pair was graded from the texts alone, before anything was measured:
  0 = a different profession, 1 = a related field but a different role, 2 = an
  overlapping role, 3 = the role. There are 20, 7, 3 and 6 pairs at each grade. The
  nursing pair names no taxonomy skills, so it exercises the semantic-only path.
- *Measured with* `uv run python -m scripts.calibrate_match`. For the browser model it runs
  the exact q8 file the browser downloads, under native ONNX Runtime, with the same
  tokenizer and [CLS] pooling. It also measures fastembed's build (`MATCH_EMBEDDINGS=server`).
  The results are committed (`raw_similarities.json`). `tests/test_match_scoring.py`
  checks that the constants in `scoring.py` are the fit of that file, and `model`-marked
  tests check that the file is still current.
- *Constants* (calibration version 1):

  | Model | Raw → 0 | Raw → 1 |
  |---|---|---|
  | `Xenova/bge-small-en-v1.5@ea104dac…` (browser, q8) | 0.6119 | 0.7480 |
  | `BAAI/bge-small-en-v1.5` (fastembed) | 0.6118 | 0.7505 |

  The two builds differ by at most 0.0061 in raw similarity on these pairs (a test keeps
  it under 0.01).

**Validation** on the labelled pairs (browser model, calibration 1, taxonomy 1):

| Grade | Pairs | Mean score | Range |
|---|---|---|---|
| 3: the role | 6 | 88 | 67–99 |
| 2: overlapping role | 3 | 47 | 40–50 |
| 1: related field | 7 | 22 | 6–39 |
| 0: different profession | 20 | 4 | 0–13 |

*Concordance* is 0.98: of all pairs of pairs with different grades, the share where the
higher grade scores higher. The tests keep these as regression guards: mean score rises
with every grade, concordance ≥ 0.95, every grade-3 pair ≥ 60 and every grade-0 pair ≤ 20.

*Bands in the UI* (`frontend/src/features/match/score-band.ts`): **Strong overlap** from
65 (every grade-3 pair scored at least 67), **Partial overlap** from 35 (grade 2 scored
40–50), **Little overlap** below 35. Grade 1 reached 39, so a related-field match can
just make "Partial". Change the bands with the labelled results, not by feel.

*Limits:* 36 pairs written by one person is a sanity check, not a statistically validated
scale. The thresholds were set after the first measurement, so they catch regressions;
they don't prove accuracy. The weakest grade-3 pair (backend, 67) loses on skill coverage
through taxonomy gaps: Celery and SQS don't imply "Message queues", and pytest doesn't imply
"Test automation".

**Versions.** Every result stores `model_name`, `scoring_version` (the formula, weights,
skill-requirement rules, chunking and section weights), `calibration_version` (per model)
and `taxonomy_version`. Two results are comparable only when all four match. Older
results aren't re-scored: the API marks them `is_current: false`, and the UI offers a
re-run.

### Match API

Code: `app/services/match/service.py`. `MATCH_EMBEDDINGS` picks where the vectors are
computed. `GET /match/config` tells the page which mode is active.

**Client mode** (production):

1. `POST /match/prepare {resume_id, jd_text}` checks the request: the resume must be the
   user's own and not archived, the JD at most 20,000 characters, and the rate limit not
   reached. It chunks both texts with the browser model's tokenizer and returns the
   chunks, the model spec and a **digest**: the sha256 of the model name, the chunking
   version and the chunks.
2. The browser embeds the chunks in a Web Worker.
3. `POST /match {resume_id, jd_text, application_id?, embeddings: {digest, jd, resume}}`:
   - *Vectors* are base64 of little-endian float32 values, row-major, one row per chunk.
     That's about 4× smaller than JSON numbers; the largest allowed request carries
     about 1.8 MB of vectors.
   - *Digest:* the server re-chunks the texts. A different digest means the texts or the
     model changed since step 1, and the answer is 409 ("prepare again").
   - *Vector checks:* the count, 384 dimensions, finite values and unit length (±0.001).
     A failed check is a 422 on `embeddings`.
   - *Cache:* client vectors never enter the shared resume-embedding cache.

**Server mode** (dev, self-hosting): `POST /match` without `embeddings`. The server
embeds with fastembed, one match per process at a time. A request that can't start
within 10 s gets a 503 with `Retry-After: 15`. **Off:** `prepare` and `POST /match`
answer 503.

**Limits:** at most 300 JD chunks and 600 resume chunks. Chunks are lines; the worst case
we measured, a 50,000-character resume against a 20,000-character JD, has 134 JD chunks and
336 resume chunks. `prepare` and `POST /match` each allow 30 requests per user per hour
(`RATE_LIMIT_MATCH_*`).

**Freezing the resume text.** A resume's text is frozen once a match uses it. Saving a
match re-reads the text `FOR SHARE`; if it no longer equals the scored text, the answer
is 409. A text edit takes `FOR UPDATE` on the resume before checking for uses. Either
order of the two transactions ends with one of them refused, never a match pointing at
text it didn't score.

**Stored result:** the score and its parts, the requirements (`{skills, label, required}`),
the suggested keywords, the top 5 evidence pairs (JD line, best resume line, raw
cosine), `sections_detected` and the versions. `GET /match` lists results newest first
without the JD text, showing an excerpt (the JD's first line, at most 120 characters)
instead.

## Health checks

- `GET /api/v1/health`: liveness, process only (used by Docker healthchecks).
- `GET /api/v1/health/ready`: readiness, runs `SELECT 1` (503 if the DB is unreachable).

See [`adr/`](./adr) for recorded decisions.
