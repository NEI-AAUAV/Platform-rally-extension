"""Alembic migration environment (async).

The target metadata is the application's ``Base.metadata``; all models are
imported so every table is registered before autogenerate runs. The database
URL and the schema come from application settings — nothing secret lives in
alembic.ini.

Migrations run against the rally schema (``settings.SCHEMA_NAME``); the alembic
version table lives in that same schema so each extension edition is
self-contained.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.models.base import Base

# Import every model so Base.metadata is complete for autogenerate.
from app.models import (  # noqa: F401
    User,
    Team,
    CheckPoint,
    RallyStaffAssignment,
    Activity,
    ActivityResult,
    RallyEvent,
    RallySettings,
    TeamBadge,
    EventParticipation,
)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

SCHEMA = settings.SCHEMA_NAME


def _async_url() -> str:
    """Application Postgres URI with the asyncpg driver."""
    return str(settings.POSTGRES_URI).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        compare_type=True,
        compare_server_default=True,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection."""
    context.configure(
        url=_async_url(),
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    # Ensure the rally schema exists before the version table is created.
    connection.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Open an async connection and run migrations through run_sync."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _async_url()
    engine = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(_do_run_migrations)
        # The migration ran on the sync facade inside run_sync; commit the
        # outer async connection so the DDL (and version row) persist.
        await connection.commit()
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
