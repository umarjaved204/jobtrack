# JobTrack

> A job application tracker with a kanban pipeline, analytics, and an AI resume-vs-job-description match score.

🚧 **Work in progress.** Built phase by phase; see the [roadmap](#roadmap).

<!-- Screenshots, demo GIF and live link land in Phase 12. -->

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
| Tooling  | uv, pnpm, Ruff, mypy, ESLint, Prettier, pytest, Vitest, Playwright, Storybook, pre-commit, GitHub Actions |
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

## Roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0  | Planning: stack, data model, API design | ✅ |
| 1  | Repo scaffold: monorepo, Docker, lint/format, pre-commit, CI skeleton | ✅ |
| 2  | Backend foundation: config, DB, models, migrations, auth (+ tests) | ✅ |
| 3  | Applications API: CRUD, status history, filters, pagination (+ tests); tags API; login/register rate limiting | ✅ |
| 4  | Frontend foundation: design tokens (WCAG AA-tested), base components, Storybook, app shell + routing | ✅ |
| 5  | Auth UI + API client (TanStack Query); cross-tab refresh coordination (Web Locks API, to verify); `429` handling | ⏳ |
| 6  | Kanban + table views, application form, detail page; contacts API | ⏳ |
| 7  | Dashboard: animated stat cards, custom charts | ⏳ |
| 8  | Calendar, reminders, resume versions | ⏳ |
| 9  | AI match service, endpoint and UI | ⏳ |
| 10 | Polish: signature animations, ⌘K palette, a11y, responsive | ⏳ |
| 11 | Test suite expansion + full CI | ⏳ |
| 12 | Deploy, demo data, screenshots, write-up | ⏳ |

### Known limitations and optional work

- **Rate limiting** on login/register: backend done (Phase 3, in-process, single instance); UI handling of `429` in Phase 5. Verify client-IP handling before the public deploy (see deployment notes).
- Password change/reset: optional, not scheduled.
- Email verification: not planned (known limitation).

See [docs/adr/0002-authentication.md](docs/adr/0002-authentication.md) and [docs/deployment.md](docs/deployment.md).

## License

MIT
