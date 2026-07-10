"""Tests for CRUDBase's commit=/flush-only behaviour against real Postgres.

Uses the Team model (already in app.models) instead of a fake stand-in, so
create/update/remove exercise real SQL — the counterpart to the old
MagicMock-session version, which only verified commit/flush call counts.
"""
import pytest

from app.crud.base import CRUDBase
from app.models.team import Team
from app.schemas.team import TeamUpdate


class _CreateSchema:
    def model_dump(self, exclude_unset=False):
        return {"name": "Test Team", "access_code": "AAAA-1111"}


@pytest.fixture
def crud():
    return CRUDBase(Team)


class TestCreate:
    async def test_commits_by_default(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        assert team.id is not None
        # Committed: visible from a fresh query in the same session.
        again = await crud.get(pg_session, id=team.id)
        assert again.id == team.id

    async def test_commit_false_only_flushes(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema(), commit=False)

        assert team.id is not None  # flushed, so it has a PK
        await pg_session.rollback()

        with pytest.raises(Exception):
            await crud.get(pg_session, id=team.id)


class TestUpdate:
    async def test_commits_by_default(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        updated = await crud.update(
            pg_session, id=team.id, obj_in=TeamUpdate(name="Renamed")
        )
        assert updated.name == "Renamed"

        again = await crud.get(pg_session, id=team.id)
        assert again.name == "Renamed"

    async def test_commit_false_only_flushes(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.update(
            pg_session, id=team.id, obj_in=TeamUpdate(name="Renamed"), commit=False
        )
        await pg_session.rollback()

        again = await crud.get(pg_session, id=team.id)
        assert again.name == "Test Team"


class TestRemove:
    async def test_commits_by_default(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.remove(pg_session, id=team.id)

        with pytest.raises(Exception):
            await crud.get(pg_session, id=team.id)

    async def test_commit_false_only_flushes(self, pg_session, crud):
        team = await crud.create(pg_session, obj_in=_CreateSchema())

        await crud.remove(pg_session, id=team.id, commit=False)
        await pg_session.rollback()

        # Removal was never committed — row still there.
        again = await crud.get(pg_session, id=team.id)
        assert again.id == team.id
