from logging.config import fileConfig

from sqlalchemy import create_engine, pool

import app.models  # noqa: F401  (registers all models on Base.metadata)
from alembic import context
from app.core.config import get_settings
from app.db.base import Base

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Compare column types AND server defaults, so `alembic check` / autogenerate catch a
# server_default changed on a model without a migration (off by default in Alembic).
COMPARE_OPTS = {"compare_type": True, "compare_server_default": True}


def _database_url() -> str:
    """Priority: explicit `sqlalchemy.url` (tests) > MIGRATION_DATABASE_URL > DATABASE_URL.
    On Neon, MIGRATION_DATABASE_URL must be the direct (non-pooled) endpoint."""
    explicit = config.get_main_option("sqlalchemy.url")
    if explicit:
        return explicit
    settings = get_settings()
    return str(settings.migration_database_url or settings.database_url)


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of executing it (`alembic upgrade head --sql`)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **COMPARE_OPTS,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        _database_url(),
        poolclass=pool.NullPool,
        # No statement timeout for migrations: index builds on big tables can be slow.
        connect_args={"connect_timeout": get_settings().db_connect_timeout_seconds},
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, **COMPARE_OPTS)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
