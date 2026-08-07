import importlib.util
import sys
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.schema import CreateSchema

import alembic as _alembic_pkg
from alembic import command
from app.core.config import settings
from app.db.seed_data import seed_data
from app.db.session import SessionLocal, engine
from app.models.base import Base

# Repo layout: api-rally/app/db/init_db.py -> api-rally/alembic.ini
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


# Migration files under alembic/versions/ do `from alembic.migration_utils
# import ...` — but this repo's local alembic/ directory (script_location in
# alembic.ini) shares its name with the *installed* alembic pip package, and
# `alembic` is already bound in sys.modules to that pip package by the time
# any migration file runs (we import it directly above, and Alembic's own
# internals import it too). No sys.path change fixes this: Python resolves
# `alembic.migration_utils` by looking up `migration_utils` on the already-
# loaded `alembic` module object, not by re-searching sys.path, so it's a
# ModuleNotFoundError every time this runs outside Alembic's own CLI
# entrypoint (which manually reads alembic.ini's prepend_sys_path and takes a
# different code path that happens to avoid this — see _run_migrations below,
# which drives Config/ScriptDirectory directly instead).
#
# Fix: load the local helper file by path and attach it to the real `alembic`
# module as an attribute named `migration_utils`, so the migrations' import
# statement finds it there instead of failing to find it on disk.
def _install_local_migration_utils_shim() -> None:
    helper_path = ALEMBIC_INI.parent / "alembic" / "migration_utils.py"
    spec = importlib.util.spec_from_file_location("alembic.migration_utils", helper_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"could not load migration helper module from {helper_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules["alembic.migration_utils"] = module
    _alembic_pkg.migration_utils = module  # type: ignore[attr-defined]


_install_local_migration_utils_shim()

# IMPORTANT: Import all models here so they're registered with Base.metadata
# before create_all() is called. Otherwise tables will be missing columns!
# The import is deliberately below _install_local_migration_utils_shim(), which
# must run first — hence the E402 exemption.
from app.models import (  # noqa: E402, F401
    Activity,
    ActivityResult,
    CheckPoint,
    CheckpointGuideIndication,
    CheckpointHintReveal,
    CheckpointMedia,
    CheckpointSkip,
    EventParticipation,
    RallyEvent,
    RallyGuideAssignment,
    RallySettings,
    RallyStaffAssignment,
    Team,
    TeamBadge,
    User,
)

# For more details: https://github.com/tiangolo/full-stack-fastapi-postgresql/issues/28


def _create_schema_and_tables(connection: Connection) -> None:
    """Bootstrap a *fresh* database: create the schema then the current tables.

    ``create_all`` produces the current schema directly, which is exactly what
    alembic baseline revision 0001 produces. Only called when the database has
    no alembic version yet (see :func:`_run_migrations`).
    """
    schemas = {table.schema for table in Base.metadata.tables.values() if table.schema}
    for schema in schemas:
        connection.execute(CreateSchema(schema, if_not_exists=True))

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


# Arbitrary constant identifying this app's migration lock; any bigint works
# as long as it's consistent across processes and doesn't collide with other
# advisory locks this database might use.
_MIGRATION_LOCK_ID = 927_364_501


async def init_db() -> None:
    # Alembic owns the schema. Fresh DBs are bootstrapped with create_all (==
    # baseline 0001) and stamped at head; existing DBs are upgraded to head so
    # new revisions ship via `alembic upgrade head` semantics on every boot.
    #
    # Production runs multiple uvicorn workers that each hit this on startup.
    # `CREATE SCHEMA IF NOT EXISTS` alone isn't race-safe under concurrent
    # transactions — Postgres can still raise a duplicate-key error on
    # pg_namespace when two sessions race the check-then-insert, crashing
    # every worker but the winner. A transaction-scoped advisory lock
    # serializes the migration: the first worker runs it, the rest block
    # here, then see current == head and return immediately once unblocked.
    async with engine.begin() as connection:
        await connection.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": _MIGRATION_LOCK_ID}
        )
        await connection.run_sync(_run_migrations)

    async with SessionLocal() as db:
        await seed_data(db)
