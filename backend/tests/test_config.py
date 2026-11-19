import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings

STRONG_SECRET = SecretStr("k3Q9vX2mZp7LwR4tYb8NcJ6hFd1sGa5e")


def test_production_refuses_the_dev_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(environment="production", refresh_cookie_secure=True)


def test_production_refuses_insecure_refresh_cookie() -> None:
    with pytest.raises(ValidationError, match="REFRESH_COOKIE_SECURE"):
        Settings(environment="production", jwt_secret_key=STRONG_SECRET)


def test_production_accepts_safe_settings() -> None:
    settings = Settings(
        environment="production", jwt_secret_key=STRONG_SECRET, refresh_cookie_secure=True
    )

    assert settings.environment == "production"


@pytest.mark.parametrize(
    "url", ["postgres://u:p@db.neon.tech/app", "postgresql://u:p@db.neon.tech/app"]
)
def test_hosted_database_urls_get_the_psycopg_driver(url: str) -> None:
    settings = Settings(database_url=url)  # type: ignore[arg-type]  # str is coerced

    assert str(settings.database_url) == "postgresql+psycopg://u:p@db.neon.tech/app"


def test_match_embeddings_default_to_the_browser(monkeypatch: pytest.MonkeyPatch) -> None:
    """A fresh clone matches without setup: the browser embeds, the server only tokenizes."""
    monkeypatch.delenv("MATCH_EMBEDDINGS", raising=False)

    assert Settings(_env_file=None).match_embeddings == "client"


def test_match_embeddings_reject_unknown_modes() -> None:
    with pytest.raises(ValidationError, match="match_embeddings"):
        Settings(match_embeddings="hosted")  # type: ignore[arg-type]
