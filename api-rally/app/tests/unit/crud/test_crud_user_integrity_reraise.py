"""Covers the generic (non-team-FK) IntegrityError re-raise branches of
CRUDUser.create/_create_internal/update, which the happy-path/team-FK tests
in test_crud_user.py don't exercise."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.crud.crud_user import user as crud_user
from app.schemas.user import UserCreate, UserUpdate


async def test_create_reraises_when_orig_is_none(pg_session):
    obj_in = UserCreate(name="Orig None")
    with (
        patch.object(
            pg_session, "commit", new=AsyncMock(side_effect=IntegrityError("x", None, None))
        ),
        pytest.raises(IntegrityError),
    ):
        await crud_user.create(pg_session, obj_in=obj_in)


async def test_create_reraises_when_error_does_not_match_team_fk(pg_session):
    obj_in = UserCreate(name="Unrelated Error")
    unrelated = IntegrityError("x", None, RuntimeError("some other constraint violation"))
    with patch.object(pg_session, "commit", new=AsyncMock(side_effect=unrelated)):
        with pytest.raises(IntegrityError):
            await crud_user.create(pg_session, obj_in=obj_in)


async def test_update_reraises_when_orig_is_none(pg_session):
    created = await crud_user.create(pg_session, obj_in=UserCreate(name="Update Orig None"))
    with patch(
        "app.crud.base.CRUDBase.update",
        new=AsyncMock(side_effect=IntegrityError("x", None, None)),
    ):
        obj_in = UserUpdate(name="New")
        with pytest.raises(IntegrityError):
            await crud_user.update(pg_session, id=created.id, obj_in=obj_in)


async def test_update_reraises_when_error_does_not_match_team_fk(pg_session):
    created = await crud_user.create(pg_session, obj_in=UserCreate(name="Update Unrelated"))
    unrelated = IntegrityError("x", None, RuntimeError("some other constraint violation"))
    with patch("app.crud.base.CRUDBase.update", new=AsyncMock(side_effect=unrelated)):
        obj_in = UserUpdate(name="New")
        with pytest.raises(IntegrityError):
            await crud_user.update(pg_session, id=created.id, obj_in=obj_in)
