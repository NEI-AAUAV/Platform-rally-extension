import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from fastapi.testclient import TestClient
from unittest.mock import patch

# Rally is an OIDC resource server: it validates authentik-issued tokens via
# JWKS discovery and no longer reads a local signing key, so there is nothing to
# mock at import time.
from app.models.base import Base
from app.main import app
from app.api.deps import get_db

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
