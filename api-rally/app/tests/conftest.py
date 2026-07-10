from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from fastapi.testclient import TestClient
from unittest.mock import patch

# Rally is an OIDC resource server: it validates authentik-issued tokens via
# JWKS discovery and no longer reads a local signing key, so there is nothing to
# mock at import time.
from app.core.config import settings as app_settings
from app.models.base import Base
from app.main import app
from app.api.deps import get_db

# Import every model so Base.metadata is complete before create_all in pg_session.
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

# Test database setup — async SQLite (aiosqlite). A single shared file lets the
# get_db override and the db fixtures see each other's committed data.
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///./test.db"
engine = create_async_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = async_sessionmaker(engine, autoflush=False, expire_on_commit=False)

# Export Session for other test files
Session = TestingSessionLocal


async def override_get_db():
    async with TestingSessionLocal() as db:
        yield db


app.dependency_overrides[get_db] = override_get_db


# NOTE: the ORM models use PostgreSQL-only column types (ARRAY), so the schema
# cannot be created on SQLite. The suite therefore mocks the database/CRUD layer
# rather than exercising a real schema. The async engine below only provides a
# real AsyncSession object for the get_db override; no tables are created.


@pytest_asyncio.fixture
async def db():
    """An AsyncSession bound to the test database (no schema; for mock-based tests)."""
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def db_session():
    """Alias of the db fixture for tests that use this name."""
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
def client():
    """Synchronous TestClient — works against the async app."""
    return TestClient(app)


@pytest.fixture
def mock_auth():
    """Mock authentication for tests"""
    with patch('app.api.api_v1.team_members.require_team_management_permission'):
        with patch('app.api.api_v1.rally_settings.validate_settings_update_access'):
            yield


_PG_SCHEMA = app_settings.SCHEMA_NAME


def _async_test_pg_url() -> str:
    """Test Postgres URI with the asyncpg driver."""
    return str(app_settings.TEST_POSTGRES_URI).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


@pytest_asyncio.fixture
async def pg_session() -> AsyncIterator[AsyncSession]:
    """A session against a freshly-created rally schema on the test Postgres.

    Real-schema fixture (exercises actual column types, constraints, SQL) —
    the counterpart to the SQLite-stub `db`/`db_session` fixtures above, which
    only provide a session object for mock-based tests. Skips when Postgres is
    unreachable so the mock-based suite still runs in isolation locally.
    """
    engine = create_async_engine(_async_test_pg_url())
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{_PG_SCHEMA}" CASCADE')
            await conn.exec_driver_sql(f'CREATE SCHEMA "{_PG_SCHEMA}"')
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
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{_PG_SCHEMA}" CASCADE')
        await engine.dispose()


@pytest.fixture
def pg_client(pg_session: AsyncSession) -> TestClient:
    """TestClient whose get_db yields the pg_session fixture's session.

    Lets API-layer tests hit real routes against a real Postgres schema
    instead of mocking the CRUD layer. Auth is untouched here — combine with
    `as_admin`/`as_user` to bypass the OIDC dependency for a given role.
    """
    async def override_get_db():
        yield pg_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides[get_db] = override_get_db  # restore SQLite override for other tests


def _fake_detailed_user(**overrides):
    from app.schemas.user import DetailedUser

    base = dict(id=1, name="Test Admin", disabled=False, scopes=["admin"])
    base.update(overrides)
    return DetailedUser(**base)


def _fake_auth_data(**overrides):
    from app.api.auth import AuthData

    base = dict(oidc_sub="test-admin-sub", name="Test Admin", scopes=["admin"])
    base.update(overrides)
    return AuthData(**base)


@pytest.fixture
def as_admin():
    """Override auth dependencies so requests act as an admin user.

    Bypasses OIDC/JWKS entirely (no token needed) — mirrors the `mock_auth`
    fixture's approach of patching auth checks rather than faking tokens.
    """
    from app.api import deps
    from app.api.auth import api_nei_auth

    user = _fake_detailed_user(scopes=["admin"])
    auth_data = _fake_auth_data(scopes=["admin"])
    app.dependency_overrides[api_nei_auth] = lambda: auth_data
    app.dependency_overrides[deps.get_admin] = lambda: user
    app.dependency_overrides[deps.get_admin_or_staff] = lambda: user
    app.dependency_overrides[deps.get_guide] = lambda: user
    app.dependency_overrides[deps.get_participant] = lambda: user
    app.dependency_overrides[deps.get_current_user_optional] = lambda: user
    try:
        yield user
    finally:
        for dep in (
            api_nei_auth,
            deps.get_admin,
            deps.get_admin_or_staff,
            deps.get_guide,
            deps.get_participant,
            deps.get_current_user_optional,
        ):
            app.dependency_overrides.pop(dep, None)


@pytest.fixture
def as_user():
    """Override auth dependencies so requests act as a plain participant."""
    from app.api import deps
    from app.api.auth import api_nei_auth

    user = _fake_detailed_user(id=2, name="Test User", scopes=[])
    auth_data = _fake_auth_data(oidc_sub="test-user-sub", name="Test User", scopes=[])
    app.dependency_overrides[api_nei_auth] = lambda: auth_data
    app.dependency_overrides[deps.get_participant] = lambda: user
    app.dependency_overrides[deps.get_current_user_optional] = lambda: user
    try:
        yield user
    finally:
        for dep in (api_nei_auth, deps.get_participant, deps.get_current_user_optional):
            app.dependency_overrides.pop(dep, None)
