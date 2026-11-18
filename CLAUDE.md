# JobTrack: project context

Job application tracker with a premium UI, analytics and an AI resume-vs-job-description match score.
A portfolio project: clean code, tests, docs and a live deployment.

## How we work
- Small, verifiable phases. Stop at the end of each phase and wait for "next".
- Explain key decisions briefly and flag trade-offs.
- Boring, well-known patterns. Never invent library APIs; when unsure, say so and point to docs / `npm view` / `pip index versions`.
- Tests alongside features. Realistic seed data, never lorem ipsum.
- End every phase with: run/verify checklist, suggested commit message, what comes next.
- Don't pin versions from memory: `pnpm add` / `uv add`, lockfiles are the source of truth.

## Stack

**Frontend**
- React 19 + Vite + TypeScript (strict). Upgraded from 18 in Phase 4: shadcn/ui v4 components
  take `ref` as a plain prop (React 19 only), which Radix `asChild` triggers rely on.
- Tailwind CSS v4 (CSS-first `@theme`, `@tailwindcss/vite`), custom theme driven by design tokens (CSS variables)
- shadcn/ui + Radix primitives as an accessible base, heavily restyled
- `motion` (import from `motion/react`) for transitions; `@number-flow/react` for animated counters
- lucide-react, Fontsource (self-hosted fonts), `cmdk` for the ⌘K palette
- React Router 8 (data mode: `createBrowserRouter`, lazy feature routes) with browser routing
  (+ `vercel.json` SPA rewrite). v8 = v7 with its future flags made default; chosen in Phase 4.
- TanStack Query v5, React Hook Form + Zod (check `@hookform/resolvers` compatibility with installed Zod)
- `@dnd-kit/core` + `@dnd-kit/sortable`, Recharts, date-fns
- Storybook, Vitest + React Testing Library, Playwright (1-2 e2e flows)
- pnpm, ESLint + Prettier

**Backend**
- Python 3.12 (3.11+ required), managed with `uv`; FastAPI, Pydantic v2 + pydantic-settings
- SQLAlchemy 2.0 (sync, `psycopg` v3) + Alembic
- PostgreSQL from day one via Docker (no SQLite)
- JWT access + refresh using PyJWT; password hashing with `pwdlib[argon2]` (not passlib)
- pytest + httpx, Ruff + mypy (strict-ish)
- Layering: `router → service → model`. No repository layer.

**Tooling/DevOps**
- Docker + docker-compose (frontend, backend, db), pre-commit hooks, GitHub Actions CI (lint, typecheck, test, build)
- Deploy: Vercel (frontend), Render (backend), Neon (Postgres). Vercel rewrites `/api/*` to the backend so the app is same-origin.

**AI (Phase 9)**: embeddings-based resume/JD matching + keyword and skill-gap extraction. Choose between `sentence-transformers`, `fastembed` (ONNX) and a hosted embeddings API at that phase (PyTorch won't fit Render free tier). Present options and wait for the user's choice.

## Key decisions
- Auth: access token in memory. Refresh token in an httpOnly cookie, rotated on each use, hashes stored in `refresh_tokens`.
- One `application_events` table is the timeline for both status changes and notes.
- Kanban ordering uses a float `position` (midpoint insertion, occasional rebalance).
- All IDs are UUIDs; all timestamps are UTC `timestamptz`.

## Data model
```
users(id, email UNIQUE lowercased, password_hash, full_name, theme, accent, created_at)
  theme enum: light, dark, system (default system)
  accent: palette colour *name* matching ^[a-z][a-z-]{0,19}$ (default "vermilion"); NOT an enum yet
refresh_tokens(id, user_id, token_hash UNIQUE, expires_at, revoked_at, created_at)
resume_versions(id, user_id, label, content_text, is_default, created_at, updated_at)
applications(id, user_id, company, role_title, location, work_mode, job_url,
  salary_min, salary_max, salary_currency, source, status, position,
  applied_on, deadline_on, resume_version_id NULL, created_at, updated_at)
  status enum: wishlist, applied, screening, interview, offer, rejected, withdrawn
  work_mode enum (nullable): remote, hybrid, onsite
  source: free text (≤ 50 chars, e.g. "LinkedIn", "Referral"), filtered case-insensitively; NOT an enum
  idx (user_id,status,position), (user_id,applied_on), GIN trigram (company, role_title) via pg_trgm
application_events(id, application_id, type enum: status_change | note,
  from_status, to_status, body, created_at)  idx (application_id, created_at)
contacts(id, application_id, name, role, email, phone, linkedin_url, notes)
tags(id, user_id, name, color, UNIQUE(user_id,name)); application_tags(application_id, tag_id)
  tag color: palette colour name, same pattern as accent (default "ink")
reminders(id, user_id, application_id NULL, title, due_at, done_at)
  partial idx (user_id, due_at) WHERE done_at IS NULL
calendar_events(id, user_id, application_id NULL, kind, title, starts_at, ends_at, location_or_link)
  kind enum: interview, assessment, deadline, other
match_results(id, user_id, resume_version_id, application_id NULL, jd_text, score,
  matched_skills jsonb, missing_skills jsonb, suggested_keywords jsonb, model_name, created_at)
```

## REST API (`/api/v1`)
```
AUTH      POST /auth/register|login|refresh|logout
USER      GET/PATCH/DELETE /users/me
APPS      GET /applications (?q &status[] &source[] &tag[] &from &to &sort &page &page_size)
          POST /applications; GET/PATCH/DELETE /applications/{id}
          POST /applications/{id}/move {status, position}   (logs a status_change event)
          GET /applications/board;  GET/POST /applications/{id}/events
CONTACTS  GET/POST /applications/{id}/contacts; PATCH/DELETE /contacts/{id}
TAGS      GET/POST /tags; PATCH/DELETE /tags/{id}
REMINDERS GET/POST /reminders; PATCH/DELETE /reminders/{id}
CALENDAR  GET /calendar?from&to (merged feed); POST /calendar-events; PATCH/DELETE /calendar-events/{id}
RESUMES   GET/POST /resumes; GET/PATCH/DELETE /resumes/{id}
MATCH     POST /match; GET /match; GET /match/{id}
ANALYTICS GET /analytics/summary|timeseries|funnel|sources
EXPORT    GET /export?format=csv|json
HEALTH    GET /health; GET /health/ready
```

## Folder structure
```
jobtrack/
├─ frontend/
│  ├─ src/{app,components/ui,features/{auth,applications,dashboard,calendar,resumes,match,settings},hooks,lib,types,styles}
│  ├─ .storybook/  e2e/  vercel.json
├─ backend/
│  ├─ app/{main.py,api/v1,core,db,models,schemas,services/match}
│  ├─ alembic/  scripts/seed.py  tests/  pyproject.toml
├─ docs/{architecture.md,adr/,screenshots/}
├─ .github/workflows/ci.yml
├─ docker-compose.yml  .pre-commit-config.yaml  .env.example  README.md  CLAUDE.md
```

## Design direction: A, "Broadsheet" (bold editorial)
- Paper `#F3EDE2`, ink `#16130F`, dominant vermilion `#E4412B`, accent cobalt `#2B4BDB`.
  Dark mode = "night edition" (`#12100E` with cream text).
- Fraunces (display) + Instrument Sans (body) + a mono for figures. Oversized numerals, strict column grid, hairline rules.
- Signature moment: "offer received" ink-stamp slam with a paper-confetti burst.
- Hex values are starting points: tune for WCAG AA, with darker text-safe variants of bright colors.
- Quality bar: distinctive display font + clean body; one dominant color, one accent, a 7-step semantic status ramp;
  polished light/dark; depth (gradients, subtle grain, layered shadows); purposeful motion respecting
  `prefers-reduced-motion`; thoughtful empty/loading (skeleton)/error states; dense data done beautifully;
  responsive, keyboard accessible. Avoid generic "AI dashboard" looks (purple gradients, identical card grids, default Recharts styling).
- Signature moments (Phase 10): hero landing/login, offer celebration, animated pipeline funnel, ⌘K palette.
- No UI code until Phase 4. Then lock the design into tokens (CSS variables + Tailwind theme): colors, type scale,
  spacing, radii, shadows, motion durations/easing.

## Features
1. Auth (sign up, log in, log out, protected routes)
2. Applications CRUD (company, role, location, job URL, salary range, source, status, dates, notes, contacts, tags)
3. Kanban pipeline with drag-and-drop that updates status and logs history
4. Table view with search, filters, sort, pagination
5. Detail page: timeline, notes, resume version used, contacts, follow-up reminder
6. Dashboard: stat cards (total, active, interview rate, offers), applications over time, funnel, source breakdown, upcoming follow-ups
7. Calendar of interviews and deadlines
8. Resume versions (store text, tag which version went to which application)
9. AI match: paste a JD → score, missing skills, suggested keywords against a chosen resume
10. Settings: profile, theme (light/dark + accent), data export (CSV/JSON)

## Phases
0. Plan (done)
1. Repo scaffold: monorepo, docker-compose, env files, lint/format, pre-commit, README skeleton (done)
2. Backend foundation: FastAPI app, config, DB session, models, Alembic migration, health check, auth with tests (done)
3. Applications API (CRUD, status history, filters/pagination) with tests (done; contacts API moved to Phase 6)
4. Frontend foundation: design tokens, fonts, Tailwind theme, base UI components in Storybook; layout, navigation, routing, page transitions (done)
5. Auth UI (hero landing/login) + API client with TanStack Query (done; then a Lighthouse + web-interface-guidelines audit, fixed on `chore/frontend-audit-fixes`)
6. Kanban + table views, application form and detail page (done; drag-and-drop choice in ADR 0003)
7. Dashboard with animated stat cards and custom charts
8. Calendar, reminders, resume versions
9. AI match service, endpoint and UI
10. Polish: offer celebration, animated funnel, ⌘K palette, empty/loading/error states, a11y, responsive, reduced motion
11. Tests (unit, integration, 1-2 Playwright flows) and CI
12. Email verification + password reset (scope in ADR 0002 "Planned"; provider chosen then)
13. Deploy, demo seed script, README with screenshots, architecture diagram, GIF, "what I learned"

## Local dev notes
- Windows dev machine. `uv` may not be on PATH; `py -m uv ...` works as a fallback.
- Backend commands run from `backend/`: `uv run pytest`, `uv run ruff check .`, `uv run mypy app tests scripts`.
- Dev data: `uv run python -m scripts.seed` (demo user `sam.okafor@jobtrack-demo.com` / `demo-password-2026`,
  ~40 applications over 90 days through the real services with a backdated clock; recreated on each run;
  refuses production). Keep it working when services change: `tests/test_seed.py` checks its invariants.
- Tests need Postgres running (`docker compose up -d db`); they use `jobtrack_test` (auto-created),
  rebuild the schema via Alembic once per run, and roll back one transaction per test.
- Never add Co-Authored-By / "Generated with Claude Code" lines to commits or PRs.

## Git workflow (from Phase 4 onward)
- The user is the **sole committer**: never add `Co-Authored-By` or "Generated with" lines to commits or PRs.
  Claude never commits or pushes; it gives the commands and the user runs them.
- Each phase gets its own branch, e.g. `phase-4-frontend-foundation`. Give the
  `git switch -c <branch>` command before starting the phase.
- At the start of a phase, show the planned commit list.
- Stop at each logical commit point: one coherent change with its tests/stories, CI-passing on
  its own. Give `git add` / `git commit` commands **one per code block**, with a conventional-commit
  message (`feat|fix|refactor|test|docs|chore(scope): ...`).
- Don't batch unrelated changes into one commit. No "wip" or "fix typo" commits: fold small
  fixes into the commit they belong to before the user commits.
- At the end of the phase, give the push command plus a PR title and description (summary,
  key decisions, how to verify, screenshots placeholder). The user merges with a **merge commit**, not squash.

## Backend conventions (established in Phase 2)
- Services own DB work and `commit()`; they raise `AppError` subclasses (`app/core/errors.py`),
  never `HTTPException`. Routers stay thin.
- Route deps: `DbSession`, `CurrentUser` from `app/api/deps.py`.
- Enums: Python `StrEnum` stored as VARCHAR + CHECK (`str_enum()` in `app/models/enums.py`), not native PG enums.
- Schema changes: edit models → `uv run alembic revision --autogenerate -m "..."` → review the file
  → `uv run alembic upgrade head`. `tests/test_migrations.py` and CI's `alembic check` catch drift.
- Auth design is recorded in `docs/adr/0002-authentication.md`: opaque rotating refresh token (hash only in DB),
  token families (one per login), reuse after a 10 s grace window revokes that family only.
- Enum changes need a hand-written migration: Alembic autogenerate ignores CHECK constraints.
- DB: `pool_pre_ping`, connect timeout, `statement_timeout` via libpq `options` (`app/db/session.py`).
  Neon: app uses the pooled URL, Alembic uses `MIGRATION_DATABASE_URL` (direct). See `docs/deployment.md`.
- pytest reports coverage (pytest-cov).
- Rate limiting: `app/core/rate_limit.py` (in-process sliding window; single instance only).
  Tests reset it via an autouse fixture. Before public deploy: verify client IP isn't spoofable (docs/deployment.md).
- pytest turns *every* warning into an error (`filterwarnings = ["error"]`).
- Ownership: every query filters by `user_id`; other users' rows are 404, never 403.
- Kanban: positions are floats 1024 apart; client sends the midpoint on drop; the server
  re-spaces a column when neighbours are < 1e-6 apart (`services/applications.py`).
- Timeline events set `created_at` in Python (DB `now()` is per transaction, so events
  created together would tie). Flush the parent row before adding events (no ORM relationship).
- List query params are repeatable (`?status=a&status=b`); `from`/`to` filter `applied_on`.
- SQLAlchemy 2.1 typing: `Select[Model]`, not `Select[tuple[Model]]`.
- Sign-up email domain check: `app/core/email_domain.py` (register only; reject only DNS-confirmed
  undeliverable; fail open otherwise). Field-level server errors use `FieldValidationError(field, msg)`,
  rendered in FastAPI's 422 list shape. Tests: the autouse `fake_dns` fixture fakes every lookup and
  any real DNS query fails the test; use ordinary fictional domains (`mailbox-ok.com`), not
  `.test`/`.example` (email-validator treats special-use names as invalid syntax).
  Seed/demo data must not go through the register endpoint (example.com has a null MX).
- Frontend commands run from `frontend/`: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Frontend conventions (established in Phase 4)
- Tokens: `src/styles/tokens.css` (hex values, light + `.dark`, `[data-accent]` blocks) → mapped to
  Tailwind in `src/styles/index.css` via `@theme inline`. Tailwind's default palette is disabled
  (`--color-*: initial`): only token colours exist. `tokens.contrast.test.ts` enforces WCAG AA for every
  pairing, theme and accent; change a colour → run `pnpm test`.
- Palette names (`src/lib/palette.ts`) are what the API stores in `users.accent` / `tags.color`.
- Theme = `.dark` class + `data-accent` on `<html>`, set pre-paint by the inline script in `index.html`
  (localStorage keys `jobtrack:theme`, `jobtrack:accent`).
- `cn` comes from `@/lib/utils` (the `cn` package configured with our custom text/ease keys), never
  directly from `"cn"`. shadcn: `pnpm dlx shadcn@latest add <name>` only (never `init`, it rewrites
  index.css), then fix the import to `@/lib/utils`, restyle to tokens, and replace `tw-animate-css`
  classes with ours (`animate-fade-in/out`, `animate-pop-in/out`, `animate-rise-in`).
- Component files export only components (Fast Refresh); cva recipes live in `components/ui/variants.ts`.
- Hover on solid fills: `hover:fill-hover` (contrast-safe overlay), never `bg-x/90`.
- Motion: CSS `--duration-*` / `--ease-*`, mirrored in `src/lib/motion.ts` for `motion/react` (tested).
  The app runs inside `<LazyMotion features={domAnimation} strict>`: use `m.div`, never `motion.div`
  (strict mode throws). Tests skip animations (`MotionGlobalConfig.skipAnimations`) and render with
  `AppProviders`; wait for visibility (`waitFor(... toBeVisible())`) since end states land next frame.
- Routing: route table in `src/app/routes.ts` (lazy feature pages, page errors render inside the shell).
  Pages use `PageHeader` (sets `<title>`, focusable h1: the shell focuses it after navigation).
- Theme state: `src/lib/theme.ts` (`useTheme`, external store; follows the OS while on "system").
- Tests: Vitest + jsdom + RTL (`src/test/setup.ts` polyfills what Radix needs). Stories sit next to components.
- pnpm `allowBuilds` in `frontend/pnpm-workspace.yaml` (esbuild denied); the Dockerfile copies it.

## Frontend conventions (established in Phase 5)
- API calls go through `api` (`src/lib/api/client.ts`); failures are always `ApiError`
  (`status`, `detail`, `fieldErrors` from 422, `retryAfterSeconds` from 429; status 0 or a bare
  502/503/504 = "can't reach JobTrack"). Never call `fetch` directly for `/api`.
- Session: `session` (`src/lib/api/session.ts`) holds the access token in memory only. Design and
  the cross-tab/Web Locks reasoning: ADR 0002 "Client implementation". Don't add refresh-and-retry
  to `/auth/*`, and never put tokens in storage.
- Server state: TanStack Query. The signed-in user is the `['session']` query
  (`sessionQueryOptions`); route loaders (`createAuthGuards`) gate pages. `createRoutes({queryClient})`
  is a factory. Sign-out (any source) clears the whole query cache via `installSignOutHandler`.
- Redirect targets from the URL go through `safeNextPath`.
- Forms: React Hook Form + Zod (`zodResolver` from `@hookform/resolvers/zod`), schemas mirror the
  backend limits. Wrap controls in `FormField` (label/hint/error + ARIA). Server errors:
  `applyServerError` (422 → fields, 429 → wait) + `useFormAlert` (fixed alert text, countdown on
  the button). Autocomplete attributes on every credential field.
- Tests: MSW v3 is the network (`src/test/msw.ts`; `http`/`HttpResponse` from `msw/http`,
  `onUnhandledFrame: 'error'`, so unhandled requests fail). `mockAuthBackend({signedIn})` is a
  stateful fake of auth + `PATCH /users/me`. `renderApp(path)` mounts the real routes/guards;
  `findPageHeading(name)` waits for the fade-in. Setup resets the session, theme and localStorage
  after each test. Use `vi.fn<typeof fetch>()`-style typed fakes; `createSessionManager(deps)` takes
  injectable fetch/locks/channel/clock for unit tests.
- Copy: no all-caps labels above titles on new pages, no "→" in buttons, sentence case,
  typographic apostrophes (’) in user-facing strings.
- Every layout renders `<SkipLink />` first and has `<main id="main">`. Email inputs:
  `spellCheck={false}` + `autoCapitalize="none"`. Brand name: `translate="no"`.
- Browser `theme-color` follows the chosen theme (`THEME_COLORS` in `src/lib/theme.ts`, same
  values in the index.html pre-paint script; a test guards drift).
- `/` renders without waiting for the session (no loader; CTA swaps when it resolves). The
  app shell is a lazy route chunk; keep heavy signed-in-only code out of public pages.
- Lighthouse: measure a production build (`pnpm build && pnpm preview`, API running) and
  report medians of 5 runs. The anonymous `/auth/refresh` 401 is expected (ADR 0002).

## Frontend conventions (established in Phase 6)
- Applications data layer: `features/applications/api.ts` (query keys, queries, mutations).
  Mutations invalidate the views that might show the change (list, board, detail, events).
  The board move is optimistic; see the comment on `useMoveApplication` before changing it.
- Kanban: classic `@dnd-kit/core` + `@dnd-kit/sortable` (ADR 0003, not `@dnd-kit/react`).
  Drag maths and announcement text live in `board-dnd.ts` (pure, unit-tested); components
  only wire events. Every drag has a non-drag path ("Move to…" menu). jsdom tests inject
  `collisionDetection={() => []}`; real drag paths are for Playwright (README limitations).
- Applications page state lives in the URL: `table-params.ts` parses each param with Zod
  (invalid → that param's default, defaults omitted from the URL), `useTableParams` reads and
  writes it (`preventScrollReset`). Any change except page/view resets to page 1.
  The search box debounces (`SEARCH_DEBOUNCE_MS`) and ignores echoes of its own URL updates.
- List links pass `state={{ from }}` so the detail page's back link restores the filtered list.
- Destructive actions use `ConfirmDialog` (`components/confirm-dialog.tsx`); results of
  background work (moves, deletes) use Sonner toasts (`toast` from `sonner`, `Toaster` in
  `AppProviders`). Screen-reader-only updates use `LiveRegion`.
- Form schemas mirror backend limits in `*-schema.ts` next to the form; edits send only dirty
  fields (`toApplicationPatch`, `toContactPatch`) and "" becomes null (clears the field).
- The fake backend (`src/test/fake-applications.ts`) must follow the real API's rules (e.g.
  `pages` is 0 when nothing matches, empty dates sort last): drift there hides real bugs.
- Radix modals hide the page from the accessibility tree: query background content with
  `{ hidden: true }` while a dialog is open.
