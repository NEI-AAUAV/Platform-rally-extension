"""Integration test for app.workers.session (real Postgres via test env)."""

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.workers.session import worker_session


@pytest.fixture(autouse=True)
def _use_test_postgres_uri(monkeypatch):
    """Point worker_session at the test database, not the app's real one.

    worker_session() builds its own engine straight from settings.POSTGRES_URI
    (by design — see its docstring), so it doesn't pick up the sqlite/test-pg
    overrides the rest of the suite uses. Redirect it to TEST_POSTGRES_URI for
    the duration of these tests.
    """
    monkeypatch.setattr(settings, "POSTGRES_URI", settings.TEST_POSTGRES_URI)


async def test_worker_session_yields_working_session_and_disposes():
    async with worker_session() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1


async def _raise_inside_worker_session() -> None:
    async with worker_session() as session:
        await session.execute(text("SELECT 1"))
        raise RuntimeError("boom")


async def test_worker_session_disposes_engine_on_exception():
    with pytest.raises(RuntimeError):
        await _raise_inside_worker_session()
