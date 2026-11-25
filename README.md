# JobTrack

> A job application tracker with a kanban pipeline, analytics, and an AI resume-vs-job-description match score.

🚧 **Work in progress.** Built phase by phase; see the [roadmap](#roadmap).

<!-- Screenshots, demo GIF and live link land in Phase 13. -->

## Features (planned)

- **Pipeline**: drag-and-drop kanban across 7 stages, with every status change logged to a timeline
- **Table view**: search, filter, sort and paginate applications
- **Detail pages**: notes, contacts, tags, follow-up reminders, and which resume version you sent
- **Dashboard**: stat cards, applications over time, conversion funnel, source breakdown
- **Calendar**: interviews and deadlines in one place
- **Resume versions**: paste your resume or import it from a PDF or Word file (read in your browser, never uploaded), and see which version went to which application
- **AI match**: paste a job description to get a match score, missing skills and keywords to add, against one of your resume versions. The embedding model runs in your browser, the score is calibrated on labelled pairs, and each application shows its latest match
- **Settings**: your name, light/dark theme and accent (saved to your account), data export (one JSON file or a zip of CSVs), delete match history, delete your account
- **Command palette** (Ctrl+K / ⌘K): search applications, jump to a page or run an action from anywhere
- **Design**: an editorial “broadsheet” look in light and night editions, built on WCAG AA-tested tokens; keyboard and screen-reader friendly, checked with axe on every main screen

## Tech stack

| Layer    | Tech |
| -------- | ---- |
| Frontend | React 19, Vite, TypeScript (strict), Tailwind CSS v4, shadcn/ui + Radix, Motion, TanStack Query, React Router 8, React Hook Form + Zod, dnd-kit, Recharts |
| Backend  | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, PostgreSQL, PyJWT, pwdlib (argon2) |
| Tooling  | uv, pnpm, Ruff, mypy, ESLint, Prettier, pytest, Vitest, MSW, Playwright, Storybook, pre-commit, GitHub Actions |
| Deploy   | Vercel (frontend) · Render (API) · Neon (Postgres) |

## Repository layout

```
frontend/   React SPA (Vite)
backend/    FastAPI app (uv project)
docs/       Architecture notes and ADRs
```

## Running locally

### Option A: Docker (everything)

Prerequisites: Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

| Service  | URL |
| -------- | --- |
| Frontend | http://localhost:5173 |
| API      | http://localhost:8000/api/v1/health |
| API docs | http://localhost:8000/api/v1/docs |
| Readiness | http://localhost:8000/api/v1/health/ready (checks the database) |
| Postgres | `localhost:5432` (user/password/db: `jobtrack`) |

### Option B: Native (faster feedback loop)

Prerequisites: [uv](https://docs.astral.sh/uv/), Node 24+, [pnpm](https://pnpm.io/), and Docker for Postgres.

```bash
docker compose up -d db                 # just the database

cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head             # create/upgrade the schema
uv run uvicorn app.main:app --reload    # http://localhost:8000
uv run python -m scripts.seed           # optional: demo user with ~3 months of realistic data

cd ../frontend
cp .env.example .env.local
pnpm install
pnpm dev                                # http://localhost:5173 (proxies /api to :8000)
pnpm storybook                          # http://localhost:6006 (design tokens + components)
```

The frontend needs the API running: with the backend stopped, sign-in and sign-up show
"Can't reach JobTrack" (the Vite proxy answers `502`). Start Docker Desktop first, then the
database and the API in one terminal and `pnpm dev` in another.

### Quality checks

Backend tests run against a real Postgres database (`jobtrack_test`, created automatically),
so start it first: `docker compose up -d db`.

```bash
# backend
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests scripts && uv run pytest
# frontend
cd frontend && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build-storybook
# with the app running and the demo data seeded: an axe scan of every main screen, and
# before/after screenshots at 1440 and 390 px in both themes (frontend/screenshots/, git-ignored)
cd frontend && pnpm a11y && pnpm screenshots <label>
# git hooks (once)
cd backend && uv run pre-commit install
```

## Quality

Audited after Phase 5 with Lighthouse 13 (production build, median of 5 runs per page) and the
[Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines); fixes in
`chore/frontend-audit-fixes`.

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT |
|---|---|---|---|---|---|---|
| `/` mobile | 70 → **85** | 100 | 96 | 91 → **100** | 4.62 → 4.23 s | 537 → 90 ms |
| `/login` mobile | 79 → **89** | 100 | 96 | 91 → **100** | 3.94 → 3.72 s | 358 → 57 ms |
| `/register` mobile | 76 → **89** | 100 | 96 | 91 → **100** | 3.96 → 3.73 s | 457 → 62 ms |
| `/` desktop | 99 | 100 | 96 | 91 → **100** | 0.93 → 0.85 s | 20 → 0 ms |

Mobile uses Lighthouse's simulated slow phone and network. What changed: the landing page
renders without waiting for the session check, the signed-in app shell is a lazy chunk (main
bundle 182 → 130 KB gzip), the headline font is preloaded, and `robots.txt` and a favicon exist.

**After the Phase 10 redesign** (same method, dev container stopped): `/` mobile is 71
(LCP 4.98 s, TBT 415 ms), accessibility 100, best practices 96, SEO 100, CLS 0. The new landing
page is heavier and is rendered by JavaScript, so nothing paints until the main bundle has
run; prerendering it is planned with the deploy (Phase 13). `pnpm a11y` (axe, WCAG 2.2 AA)
reports no violations on any main screen at either width or in either theme.

**Why Best practices stays at 96:** an anonymous visitor's session check
(`POST /api/v1/auth/refresh`) correctly returns `401`, and browsers log every 4xx as a console
error. The refresh cookie is httpOnly, so the app must ask the server whether a session exists.
This is intentional; see [ADR 0002](docs/adr/0002-authentication.md).

## Roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0  | Planning: stack, data model, API design | ✅ |
| 1  | Repo scaffold: monorepo, Docker, lint/format, pre-commit, CI skeleton | ✅ |
| 2  | Backend foundation: config, DB, models, migrations, auth (+ tests) | ✅ |
| 3  | Applications API: CRUD, status history, filters, pagination (+ tests); tags API; login/register rate limiting | ✅ |
| 4  | Frontend foundation: design tokens (WCAG AA-tested), base components, Storybook, app shell + routing | ✅ |
| 5  | Landing page, sign-in/up forms, API client (TanStack Query), route guards; cross-tab refresh coordination (Web Locks); `429` handling | ✅ |
| 6  | Kanban board (keyboard + touch drag, “Move to…” menu), table with URL-synced filters, application form, detail page with timeline and contacts; contacts API; dev seed script | ✅ |
| 7  | Dashboard: analytics API (cohort by applied date, stages from the timeline), animated stat strip, applications over time, pipeline funnel, sources, apply-by dates coming up; date range in the URL | ✅ |
| 8  | Resume versions (archived once used, text frozen), follow-up reminders (all-day or timed, zone-aware), calendar with an accessible month grid and a merged feed; interviews, assessments, deadlines and reminders join the dashboard’s “Coming up” | ✅ |
| 9  | AI match: skills taxonomy and section-aware requirements, embeddings in the browser (Web Worker, multi-threaded through cross-origin isolation, vectors cached in IndexedDB), calibrated and versioned scores, match history, latest match on each application, delete history | ✅ |
| 9b | Resume file import: PDF (pdf.js) and Word .docx (mammoth) read in the browser, never uploaded; lines rebuilt from PDF text positions, bullets and hyphenation cleaned up, file type checked from its first bytes; the text is reviewed before saving | ✅ |
| 10 | Redesign to the “broadsheet” mockups (every page, light and night), offer ink-stamp celebration, animated funnel, ⌘K palette; Settings (name, theme and accent, data export as JSON or CSV, delete account); empty, loading and error states; accessibility (axe scan, dialogs return focus, names that match the visible text) and phone layouts | ✅ |
| 11 | Test suite expansion + full CI, incl. Playwright for the Kanban drag paths jsdom can't run (below) | ⏳ |
| 12 | Email verification + password reset (non-blocking verify banner; reset never reveals if an account exists) | ⏳ |
| 13 | Deploy, demo data, screenshots, write-up | ⏳ |

### Known limitations and optional work

- **Rate limiting** on login/register: backend (Phase 3, in-process, single instance) and UI countdown from `Retry-After` (Phase 5). Verify client-IP handling before the public deploy (see deployment notes).
- **Kanban drag tests**: jsdom has no layout, so these drag paths are verified in a real browser and belong in the Phase 11 Playwright flow: pointer drag between and within columns (5 px threshold), touch press-and-hold (250 ms) versus swipe-to-scroll, keyboard arrow-key movement between columns (including through empty and off-screen columns), drop animation on/off with `prefers-reduced-motion`, and auto-scroll near the board edges. Unit tests cover the drop maths; jsdom tests cover keyboard pick-up/drop/cancel, the "Move to…" menu and failures.
- **Source filter options** come from the board data (every application), since there's no endpoint listing sources. A small `GET /applications/sources` would avoid fetching the board in table view.
- **Reminders are in-app only**: they show on the application, the calendar and the dashboard. Nothing is emailed or pushed.
- **Time zones**: times are entered and shown in the browser’s zone and stored in UTC; there’s no per-user zone setting. All-day reminders and apply-by dates are plain dates and never shift between zones.
- **Resumes** are plain text (up to 50,000 characters), pasted or imported from a PDF or .docx file up to 5 MB. Scanned PDFs (no text layer: no OCR), password-protected files and old .doc files are refused with a message asking to paste the text. Text in columns or tables may come out in the wrong order, which is why the imported text is shown for review before saving.
- **AI match** is English-only and estimates overlap; it doesn't predict how an employer or an ATS ranks a resume. Its calibration rests on 36 labelled pairs written by one person. Phone-class performance is unmeasured until a real device is tried (CPU throttling doesn't reach Web Workers). See ADR 0004.
- **Data export** leaves out match results (they're derived from a resume and an advert, and can be deleted in Settings). The format is in [docs/architecture.md](docs/architecture.md#data-export).
- **Landing page performance**: the redesigned landing page scores 71 on mobile Lighthouse (85 before), because it is rendered by JavaScript. Prerendering it to static HTML at build time is planned with the deploy.
- **Email address** is shown in Settings but can't be changed yet: changing it needs the verification flow from Phase 12.
- **Command palette** searches applications, pages and actions; per-application actions (add a note, move, match) from the mockup are left for later.
- **Settings side nav** links to each section but doesn't highlight the one in view.
- **Reminder lists aren’t paginated**: a personal account’s reminders stay small, and the views use open reminders or one application’s.
- **Exits by stage** (later): the dashboard shows how many applications were rejected or withdrawn, not after which stage. The timeline has the data (the last stage before the exit); it needs its own analytics field and a decision on how to show it.
- **Dashboard bundle**: Recharts makes the lazy `/dashboard` chunk ~116 KB gzip (the main bundle is unaffected). If first paint matters later, the chart can become its own lazy chunk so the figures show first.
- **Keyboard dragging** can occasionally skip a column when arrow keys are pressed faster than ~5 per second (dnd-kit measures card positions while the previous move animates). The "Move to…" menu on every card is the dependable keyboard path.
- **Cross-tab sessions** use the Web Locks API, which needs a secure context (HTTPS or `localhost`). Opening the dev server from another device via a LAN IP uses the fallback path; see ADR 0002.
- **Email addresses**: format is checked on client and server, and sign-up rejects domains that DNS confirms can't receive mail (typos like `gmial.com`). That doesn't prove the inbox exists: verification links and password reset are Phase 12.

See [docs/adr/0002-authentication.md](docs/adr/0002-authentication.md), [docs/adr/0003-kanban-drag-and-drop.md](docs/adr/0003-kanban-drag-and-drop.md), [docs/adr/0004-resume-matching-local-embeddings.md](docs/adr/0004-resume-matching-local-embeddings.md) and [docs/deployment.md](docs/deployment.md).

## License

MIT
