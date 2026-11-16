# ADR 0001: Monorepo with a React SPA and a FastAPI backend

- **Status:** Accepted
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
