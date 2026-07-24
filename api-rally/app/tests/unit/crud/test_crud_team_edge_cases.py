"""Covers CRUDTeam.create's generic IntegrityError re-raise branches, the
classification-update-failure swallow path, and the locked-array None-skip
branch in update() that test_crud.py's happy paths don't exercise."""
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate, TeamUpdate
from app.tests.conftest import make_event as _make_event


async def test_create_reraises_when_orig_is_none(pg_session):
    await _make_event(pg_session)
    obj_in = TeamCreate(name="Orig None Team")
    with patch.object(
        pg_session, "commit", new=AsyncMock(side_effect=IntegrityError("x", None, None))
    ):
        with pytest.raises(IntegrityError):
            await crud_team.create(pg_session, obj_in=obj_in)


async def test_create_reraises_when_error_does_not_match_name_unique(pg_session):
    await _make_event(pg_session)
    obj_in = TeamCreate(name="Unrelated Error Team")
    unrelated = IntegrityError("x", None, RuntimeError("some other constraint violation"))
    with patch.object(pg_session, "commit", new=AsyncMock(side_effect=unrelated)):
        with pytest.raises(IntegrityError):
            await crud_team.create(pg_session, obj_in=obj_in)


async def test_create_logs_and_continues_when_classification_update_fails(pg_session):
    await _make_event(pg_session)
    with patch.object(
        crud_team,
        "update_classification",
        new=AsyncMock(side_effect=RuntimeError("boom")),
    ):
        result = await crud_team.create(pg_session, obj_in=TeamCreate(name="Resilient Team"))
    assert result.id is not None
    assert result.name == "Resilient Team"


async def test_update_skips_locked_array_validation_when_value_is_none(pg_session):
    await _make_event(pg_session)
    created = await crud_team.create(pg_session, obj_in=TeamCreate(name="Locked Array Team"))

    # Explicitly setting a locked-array field to None (allowed by TeamUpdate's
    # Optional[...] = None schema) makes update_data[key] None, which hits the
    # `if value is None: continue` branch inside the locked-array size check.
    # `update_unlocked` is stubbed to a no-op so the (DB-disallowed) None value
    # is never actually persisted to the NOT NULL array columns — only the
    # validation loop above it is under test here.
    with patch(
        "app.crud.crud_team.CRUDBase.update_unlocked", return_value=created
    ):
        updated = await crud_team.update(
            pg_session,
            id=created.id,
            obj_in=TeamUpdate(name="Renamed Locked Team", times=None, question_scores=None),
        )
    assert updated.id == created.id
