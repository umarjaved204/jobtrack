# Deployment notes

_The full deploy guide is written in Phase 12. These notes record decisions that affect it._

## Database: Neon (PostgreSQL)

Neon gives each database two connection strings:

| | Host looks like | Use for |
|---|---|---|
| **Pooled** (PgBouncer, transaction mode) | `ep-xxx-pooler.<region>.aws.neon.tech` | The running API: `DATABASE_URL` |
| **Direct** | `ep-xxx.<region>.aws.neon.tech` | Alembic: `MIGRATION_DATABASE_URL` |

**Alembic must use the direct connection.** In transaction-pooling mode, session state
(advisory locks, `SET`, long DDL transactions) isn't guaranteed to stay on one server
connection, which is what migrations rely on. `alembic/env.py` uses
`MIGRATION_DATABASE_URL` when it's set and falls back to `DATABASE_URL`, and the container
runs `alembic upgrade head` on start, so set **both** variables on Render.

Both URLs can be pasted exactly as Neon shows them (`postgresql://…?sslmode=require`):
the settings rewrite the scheme to `postgresql+psycopg://` automatically.

> ⚠️ **Check in Neon's docs before deploying** (I'm not certain of the current behaviour):
> 1. *Connection pooling* page: whether the pooled endpoint accepts the libpq `options`
>    startup parameter. We use it to set `statement_timeout` (`DB_STATEMENT_TIMEOUT_MS`).
>    If it's rejected, set `DB_STATEMENT_TIMEOUT_MS=0` and run once over the **direct** URL:
>    `ALTER ROLE <app_role> SET statement_timeout = '20s';`
> 2. Same page: whether prepared statements are supported through the pooler. psycopg 3
>    auto-prepares a query after 5 executions. If you see "prepared statement … does not
>    exist" errors, add `"prepare_threshold": None` to `connect_args()` in `app/db/session.py`.
> 3. That the Migrations/Prisma guide still recommends the direct connection for schema changes.

## How the connection settings interact with Neon's free tier

The free tier **suspends the compute after a few minutes idle** (scale to zero); the next
connection wakes it, usually in well under a second.

- **`pool_pre_ping=True`**: suspending closes every server-side connection, so connections
  sitting in our pool go stale. Pre-ping runs a cheap check before each checkout, discards
  the dead connection and opens a fresh one. That reconnect is what wakes the compute.
  Without it, the first request after a quiet period fails with "server closed the connection".
- **`DB_CONNECT_TIMEOUT_SECONDS=10`**: covers the wake-up time with plenty of margin, but
  still fails fast (instead of hanging forever) if Neon is actually down.
- **`DB_STATEMENT_TIMEOUT_MS=20000`**: only applies once a query is running, so the wake-up
  doesn't count against it. It stops a runaway query from tying up a connection.
  Migrations deliberately run **without** it (index builds can be slow).
- **Render's free tier also sleeps** (after ~15 min without traffic), so the first request
  after a long idle period can take tens of seconds. That's Render's cold start, not the DB.

## Required environment variables (API)

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` (enables the safety checks below) |
| `DATABASE_URL` | Neon **pooled** connection string |
| `MIGRATION_DATABASE_URL` | Neon **direct** connection string |
| `JWT_SECRET_KEY` | random, 32+ chars: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `REFRESH_COOKIE_SECURE` | `true` (the app refuses to start in production otherwise) |
