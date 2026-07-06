from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.schema import CreateSchema
from sqlalchemy import inspect
from sqlalchemy.engine import Connection

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory

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
    """Run schema/table DDL on a synchronous connection (via run_sync)."""
    inspector = inspect(connection)
    all_schemas = inspector.get_schema_names()
    for schema in Base.metadata._schemas:
        if schema not in all_schemas:
            connection.execute(CreateSchema(schema))

    Base.metadata.reflect(bind=connection, schema=settings.SCHEMA_NAME)
    Base.metadata.create_all(bind=connection, checkfirst=True)


def _stamp_alembic_head(connection: Connection) -> None:
    """Mark the DB as being at the alembic head revision, if not already tracked.

    ``create_all`` above builds the *current* schema directly, which is exactly
    what baseline revision 0001 produces. The historical revisions 0002..head are
    incremental steps that assume older schemas and cannot be replayed on top of a
    create_all database — so we stamp head rather than upgrade. This makes future
    schema changes (added as new revisions) applicable via ``alembic upgrade head``
    without the version table drifting. Idempotent: if the DB already carries an
    alembic version we leave it untouched so real upgrades are never skipped.
    """
    context = MigrationContext.configure(
        connection,
        opts={"version_table_schema": settings.SCHEMA_NAME},
    )
    if context.get_current_revision() is not None:
        return  # already tracked — let `alembic upgrade head` own future changes

    alembic_cfg = Config(str(ALEMBIC_INI))
    head = ScriptDirectory.from_config(alembic_cfg).get_current_head()
    if head is not None:
        context.stamp(ScriptDirectory.from_config(alembic_cfg), head)


async def init_db() -> None:
    # Fresh databases are bootstrapped with create_all (which yields the current
    # schema == alembic baseline 0001), then stamped at head so future schema
    # changes ship as new alembic revisions applied via `alembic upgrade head`.
    async with engine.begin() as connection:
        await connection.run_sync(_create_schema_and_tables)
        await connection.run_sync(_stamp_alembic_head)

    from app.db.session import SessionLocal
    from app.db.seed_data import seed_data

    async with SessionLocal() as db:
        await seed_data(db)
