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
- **AI match**: paste a job description to get a match score, missing skills and keywords to add
- **Settings**: light/dark theme, accent color, CSV/JSON export

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
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests && uv run pytest
# frontend
cd frontend && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build-storybook
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
| 6  | Kanban + table views, application form, detail page; contacts API | ⏳ |
| 7  | Dashboard: animated stat cards, custom charts | ⏳ |
| 8  | Calendar, reminders, resume versions | ⏳ |
| 9  | AI match service, endpoint and UI | ⏳ |
| 10 | Polish: signature animations, ⌘K palette, a11y, responsive | ⏳ |
| 11 | Test suite expansion + full CI | ⏳ |
| 12 | Email verification + password reset (non-blocking verify banner; reset never reveals if an account exists) | ⏳ |
| 13 | Deploy, demo data, screenshots, write-up | ⏳ |

### Known limitations and optional work

- **Rate limiting** on login/register: backend (Phase 3, in-process, single instance) and UI countdown from `Retry-After` (Phase 5). Verify client-IP handling before the public deploy (see deployment notes).
- **Cross-tab sessions** use the Web Locks API, which needs a secure context (HTTPS or `localhost`). Opening the dev server from another device via a LAN IP uses the fallback path; see ADR 0002.
- **Email addresses** are checked for format only (client and server). A domain (MX) check at sign-up is planned next; verification links and password reset are Phase 12.

See [docs/adr/0002-authentication.md](docs/adr/0002-authentication.md) and [docs/deployment.md](docs/deployment.md).

## License

MIT
