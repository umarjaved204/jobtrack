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

See [`adr/`](./adr) for recorded decisions.
