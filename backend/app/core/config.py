"""Application settings, loaded from environment variables (and `.env` in local dev)."""

from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Only needed when the frontend is served from a different origin
    # (in production Vercel proxies /api/* so the app is same-origin).
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
