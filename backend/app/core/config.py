"""Application settings, loaded from environment variables (and `.env` in local dev)."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, PostgresDsn, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Only for local dev/tests. Production refuses to start with it (see validator below).
_DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "JobTrack API"
    environment: Literal["local", "test", "production"] = "local"
    api_v1_prefix: str = "/api/v1"

    # Format: postgresql+psycopg://user:password@host:5432/dbname
    # Inside docker-compose the host is the `db` service; outside it is `localhost`.
    database_url: PostgresDsn = PostgresDsn(
        "postgresql+psycopg://jobtrack:jobtrack@localhost:5432/jobtrack"
    )
    # Optional separate URL for Alembic. On Neon, DATABASE_URL is the *pooled* endpoint
    # and this must be the *direct* one (see docs/deployment.md). Falls back to database_url.
    migration_database_url: PostgresDsn | None = None
    # Seconds to wait for a TCP connection (covers a Neon compute waking from suspend).
    db_connect_timeout_seconds: int = Field(default=10, gt=0)
    # Server-side cap on any single SQL statement; 0 disables it.
    db_statement_timeout_ms: int = Field(default=20_000, ge=0)

    # Only needed when the frontend is served from a different origin
    # (in production Vercel proxies /api/* so the app is same-origin).
    cors_origins: list[str] = ["http://localhost:5173"]

    # ---- Auth
    jwt_secret_key: SecretStr = SecretStr(_DEV_JWT_SECRET)
    jwt_algorithm: Literal["HS256"] = "HS256"
    access_token_expire_minutes: int = Field(default=15, gt=0)
    refresh_token_expire_days: int = Field(default=30, gt=0)
    refresh_cookie_name: str = "jobtrack_refresh"
    # Browsers treat http://localhost as a secure context, but test clients don't;
    # production must set this to true (enforced below).
    refresh_cookie_secure: bool = False
    # A token rotated less than this many seconds ago is treated as a benign race
    # (two tabs, retried request), not theft. See docs/adr/0002-authentication.md.
    refresh_reuse_grace_seconds: int = Field(default=10, ge=0)

    @field_validator("database_url", "migration_database_url", mode="before")
    @classmethod
    def _use_psycopg_driver(cls, value: object) -> object:
        """Hosts like Neon/Render hand out `postgres://` or `postgresql://` URLs;
        SQLAlchemy needs the driver spelled out to pick psycopg v3."""
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @model_validator(mode="after")
    def _check_production_safety(self) -> Self:
        if self.environment == "production":
            secret = self.jwt_secret_key.get_secret_value()
            if secret == _DEV_JWT_SECRET or len(secret) < 32:
                raise ValueError("JWT_SECRET_KEY must be set to a random value of 32+ characters")
            if not self.refresh_cookie_secure:
                raise ValueError("REFRESH_COOKIE_SECURE must be true in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
