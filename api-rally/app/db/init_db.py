from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.schema import CreateSchema
from sqlalchemy import inspect
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.models.base import Base
from .session import engine

# Repo layout: api-rally/app/db/init_db.py -> api-rally/alembic.ini
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

# IMPORTANT: Import all models here so they're registered with Base.metadata
# before create_all() is called. Otherwise tables will be missing columns!
from app.models import (  # noqa: F401
    User,
    Team,
    CheckPoint,
    RallyStaffAssignment,
    RallyGuideAssignment,
    CheckpointMedia,
    CheckpointGuideIndication,
    Activity,
    ActivityResult,
    RallyEvent,
    RallySettings,
    TeamBadge,
    EventParticipation,
)

# For more details: https://github.com/tiangolo/full-stack-fastapi-postgresql/issues/28


def _create_schema_and_tables(connection: Connection) -> None:
    """Bootstrap a *fresh* database: create the schema then the current tables.

    ``create_all`` produces the current schema directly, which is exactly what
    alembic baseline revision 0001 produces. Only called when the database has
    no alembic version yet (see :func:`_run_migrations`).
    """
    inspector = inspect(connection)
    all_schemas = inspector.get_schema_names()
    for schema in Base.metadata._schemas:
        if schema not in all_schemas:
            connection.execute(CreateSchema(schema))

    Base.metadata.reflect(bind=connection, schema=settings.SCHEMA_NAME)
    Base.metadata.create_all(bind=connection, checkfirst=True)


def _run_migrations(connection: Connection) -> None:
    """Bring the database to alembic head, choosing the right path by DB state.

    Alembic is the single source of truth for schema. Two cases:

    * **Fresh DB** (no alembic version row): ``create_all`` builds the current
      schema in one shot — replaying revisions 0002..head is impossible because
      the historical steps assume older schemas. We then stamp head so future
      revisions apply cleanly. This is the fast bootstrap path.
    * **Existing DB** (already tracked): run ``alembic upgrade head`` so any new
      revisions shipped since the last boot are actually applied. Without this
      the version table would silently drift behind the code and the schema
      would be missing new columns/tables.

    Both branches run on the synchronous connection provided by ``run_sync`` and
    share that connection with alembic, so no second engine or nested event loop
    is created.
    """
    alembic_cfg = Config(str(ALEMBIC_INI))
    # Share the live connection with the alembic env so migrations run on this
    # same transaction (see alembic/env.py) — no second engine, no nested loop.
    alembic_cfg.attributes["connection"] = connection
    script = ScriptDirectory.from_config(alembic_cfg)
    head = script.get_current_head()

    context = MigrationContext.configure(
        connection,
        opts={"version_table_schema": settings.SCHEMA_NAME},
    )
    current = context.get_current_revision()

    if current is None:
        # Fresh database: build the current schema directly, then stamp head.
        _create_schema_and_tables(connection)
        if head is not None:
            context.stamp(script, head)
        return

    if current == head:
        return  # already up to date

    # Existing database behind head: apply outstanding revisions via alembic's
    # own machinery so the ``op`` proxy is established for the migration bodies.
    command.upgrade(alembic_cfg, "head")


async def init_db() -> None:
    # Alembic owns the schema. Fresh DBs are bootstrapped with create_all (==
    # baseline 0001) and stamped at head; existing DBs are upgraded to head so
    # new revisions ship via `alembic upgrade head` semantics on every boot.
    async with engine.begin() as connection:
        await connection.run_sync(_run_migrations)

    from app.db.session import SessionLocal
    from app.db.seed_data import seed_data

    async with SessionLocal() as db:
        await seed_data(db)
