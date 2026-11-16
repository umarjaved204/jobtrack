from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine

import app.models  # noqa: F401  (register all models)
from app.db.base import Base


def test_migrations_match_models(engine: Engine) -> None:
    """Fails if a model (columns, types, indexes, server defaults) and the migrations disagree.

    Not covered by Alembic: CHECK constraints, so enum value changes need a hand-written
    migration (see docs/adr/0002-authentication.md).
    """
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True, "compare_server_default": True}
        )
        diff = compare_metadata(context, Base.metadata)

    assert diff == []
