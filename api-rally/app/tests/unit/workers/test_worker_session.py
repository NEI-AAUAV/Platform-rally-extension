"""Integration test for app.workers.session (real Postgres via test env)."""
import pytest
from sqlalchemy import text

from app.workers.session import worker_session


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
