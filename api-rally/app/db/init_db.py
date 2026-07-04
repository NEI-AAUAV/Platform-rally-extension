from sqlalchemy.schema import CreateSchema
from sqlalchemy import inspect
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.models.base import Base
from .session import engine

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


async def init_db() -> None:
    # For extensions, we use simple table creation since schemas are dropped/created
    # when extensions are disabled/enabled. This is simpler and more appropriate
    # than complex migration management for temporary schemas.
    async with engine.begin() as connection:
        await connection.run_sync(_create_schema_and_tables)

    from app.db.session import SessionLocal
    from app.db.seed_data import seed_data

    async with SessionLocal() as db:
        await seed_data(db)
