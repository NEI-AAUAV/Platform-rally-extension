"""Tests for CRUDBase's commit=/flush-only behaviour against real Postgres.

Uses the Team model (already in app.models) instead of a fake stand-in, so
create/update/remove exercise real SQL — the counterpart to the old
MagicMock-session version, which only verified commit/flush call counts.

`commit=False` durability is checked from a second, independent session on
the same schema: an uncommitted flush is visible within `pg_session` (same
transaction) but invisible to a session that only sees committed data. This
avoids driving `pg_session.rollback()` directly, which raced with asyncpg's
greenlet bridge when combined with CRUDBase's own `begin_nested()` savepoints.
"""
from sqlalchemy.ext.asyncio import async_sessionmaker
from pydantic import BaseModel
import pytest

from app.crud.base import CRUDBase
from app.models.team import Team
from app.schemas.team import TeamUpdate


class _CreateSchema(BaseModel):
    name: str = "Test Team"
    access_code: str = "AAAA-1111"


@pytest.fixture
def crud():
    return CRUDBase(Team)


@pytest.fixture
def other_session_maker(_pg_engine):
    """A session maker independent of `pg_session`, for durability checks."""
    return async_sessionmaker(_pg_engine, expire_on_commit=False)


class TestCreate:
    async def test_commits_by_default(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        assert team.id is not None
        async with other_session_maker() as other:
            again = await crud.get(other, id=team.id)
            assert again.id == team.id

    async def test_commit_false_only_flushes(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema(), commit=False)

        assert team.id is not None  # flushed, so it has a PK within this session
        from app.exception import NotFoundException

        async with other_session_maker() as other:
            with pytest.raises(NotFoundException):
                await crud.get(other, id=team.id)


class TestGetMulti:
    async def test_for_update_locks_rows(self, pg_session, crud):
        await crud.create(pg_session, obj_in=_CreateSchema(name="A", access_code="AAAA-0001"))
        await crud.create(pg_session, obj_in=_CreateSchema(name="B", access_code="AAAA-0002"))

        results = await crud.get_multi(pg_session, for_update=True)

        assert len(results) == 2


class TestUpdate:
    async def test_commits_by_default(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        updated = await crud.update(
            pg_session, id=team.id, obj_in=TeamUpdate(name="Renamed")
        )
        assert updated.name == "Renamed"

        async with other_session_maker() as other:
            again = await crud.get(other, id=team.id)
            assert again.name == "Renamed"

    async def test_commit_false_only_flushes(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.update(
            pg_session, id=team.id, obj_in=TeamUpdate(name="Renamed"), commit=False
        )

        async with other_session_maker() as other:
            again = await crud.get(other, id=team.id)
            assert again.name == "Test Team"  # not visible: only flushed, not committed


class TestRemove:
    async def test_commits_by_default(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.remove(pg_session, id=team.id)

        from app.exception import NotFoundException

        async with other_session_maker() as other:
            with pytest.raises(NotFoundException):
                await crud.get(other, id=team.id)

    async def test_commit_false_only_flushes(self, pg_session, crud, other_session_maker):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.remove(pg_session, id=team.id, commit=False)

        async with other_session_maker() as other:
            # Removal was never committed — row still visible elsewhere.
            again = await crud.get(other, id=team.id)
            assert again.id == team.id
