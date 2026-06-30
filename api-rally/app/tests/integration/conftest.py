"""Postgres-backed fixtures for real-schema integration tests.

The default test suite is mock-based because the ORM uses Postgres-only column
types (ARRAY), so the schema cannot be created on SQLite. These fixtures spin a
real schema on Postgres instead, exercising the actual column types and SQL —
catching bugs the mock suite structurally cannot (e.g. ARRAY round-trips, server
defaults, constraint behaviour).

They self-skip when no Postgres is reachable, so a developer without a database
still gets a green local run; CI provides Postgres and runs them for real.

The fixture is function-scoped (fresh engine + schema per test): pytest-asyncio
runs each test in its own event loop, and a session-scoped async engine bound to
an earlier loop raises "another operation is in progress" on reuse.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.models.base import Base

# Import every model so Base.metadata is complete before create_all.
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

SCHEMA = settings.SCHEMA_NAME


def _async_test_url() -> str:
    """Test Postgres URI with the asyncpg driver."""
    return str(settings.TEST_POSTGRES_URI).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


@pytest_asyncio.fixture
async def pg_session() -> AsyncIterator[AsyncSession]:
    """A session against a freshly-created rally schema on the test Postgres.

    Skips the test when Postgres is unreachable so the mock-based suite still
    runs in isolation.
    """
    engine = create_async_engine(_async_test_url())
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
            await conn.exec_driver_sql(f'CREATE SCHEMA "{SCHEMA}"')
            await conn.run_sync(Base.metadata.create_all)
    except (SQLAlchemyError, OSError) as exc:
        await engine.dispose()
        pytest.skip(f"Postgres not available for integration tests: {exc}")

    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    finally:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
        await engine.dispose()
