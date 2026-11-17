# ADR 0001: Monorepo with a React SPA and a FastAPI backend

- **Status:** Accepted (revised in Phase 4: React 19 and React Router 8, see *Revisions*)
- **Date:** 2026-11-16

## Context

JobTrack is a solo-built portfolio project that has to be easy to clone, run and review.
It needs a rich interactive UI (drag-and-drop, charts, animation) and a Python backend
(the AI match feature reuses the Python/ML ecosystem).

## Decision

- One repository with `frontend/` and `backend/`, each with its own native tooling
  (pnpm / uv) instead of a JS-centric monorepo tool. Two languages don't benefit from Turborepo/Nx.
- React SPA (Vite) + FastAPI REST API, same-origin via a proxy (Vite in dev, Vercel rewrites in prod).
- PostgreSQL everywhere (Docker locally, Neon in production): no SQLite, so we can rely on
  `pg_trgm`, `jsonb`, partial indexes and `timestamptz` from the start.
- Lockfiles (`uv.lock`, `pnpm-lock.yaml`) are the source of truth for versions.

## Consequences

- Two toolchains to install; Docker Compose hides that for anyone who just wants to run it.
- No SSR: SEO doesn't matter for an authenticated app, and the landing page is a single route.

## Revisions

The original plan (Phase 0) named React 18 and React Router 7. Both were upgraded in Phase 4,
before any feature code depended on them:

- **React 18 → 19** (2026-11-17). shadcn/ui v4 generates components that receive `ref` as a
  plain prop, which only works in React 19 (React 18 function components never receive refs).
  Radix `asChild` triggers (dialogs, menus, tooltips) need that ref for positioning and focus
  return, so staying on 18 would have meant hand-writing every component with `forwardRef`
  and drifting from upstream shadcn. All other dependencies (Radix, TanStack Query, motion,
  Storybook 10) support React 19.
- **React Router 7 → 8** (2026-11-17). v8 was the current major when routing was built. Its
  changelog shows it is v7 with the v7 "future" flags made the default, ESM-only, React ≥ 19.2.7
  and Node ≥ 22, with the same data-mode APIs we use (`createBrowserRouter`, `RouterProvider`
  from `react-router/dom`, route `lazy`, `ErrorBoundary`/`useRouteError`). Starting on the
  previous major would only have bought a later migration.

CLAUDE.md's stack section records the same versions.
