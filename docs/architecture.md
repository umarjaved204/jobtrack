# Architecture

_Filled in as the system takes shape; a diagram arrives in Phase 12._

## Request flow

```
Browser ──► Vercel (static SPA)
   │
   └─ /api/* ──(Vercel rewrite)──► Render: FastAPI ──► Neon: PostgreSQL
```

In local dev the Vite dev server plays Vercel's role and proxies `/api/*` to FastAPI,
so the frontend is same-origin in every environment (simpler cookies, no CORS in prod).

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

## Health checks

- `GET /api/v1/health`: liveness, process only (used by Docker healthchecks).
- `GET /api/v1/health/ready`: readiness, runs `SELECT 1` (503 if the DB is unreachable).

See [`adr/`](./adr) for recorded decisions.
