"""Unit tests for CRUDBase's commit=/flush-only behaviour."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.crud.base import CRUDBase


class _Model:
    """Minimal stand-in for a SQLAlchemy model."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _CreateSchema:
    def model_dump(self, exclude_unset=False):
        return {"name": "x"}


class _UpdateSchema:
    def model_dump(self, exclude_unset=False):
        return {"name": "y"}


@pytest.fixture
def crud():
    return CRUDBase(_Model)


@pytest.fixture
def db():
    session = MagicMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.get = AsyncMock(return_value=_Model(id=1))
    session.begin_nested = MagicMock()
    session.begin_nested.return_value.__aenter__ = AsyncMock(return_value=None)
    session.begin_nested.return_value.__aexit__ = AsyncMock(return_value=None)
    return session


class TestCreate:
    @pytest.mark.asyncio
    async def test_commits_by_default(self, crud, db):
        await crud.create(db, obj_in=_CreateSchema())
        db.commit.assert_awaited_once()
        db.flush.assert_not_awaited()
        db.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_commit_false_only_flushes(self, crud, db):
        await crud.create(db, obj_in=_CreateSchema(), commit=False)
        db.commit.assert_not_awaited()
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once()


class TestUpdate:
    @pytest.mark.asyncio
    async def test_commits_by_default(self, crud, db, monkeypatch):
        monkeypatch.setattr(crud, "update_unlocked", lambda *, db_obj, obj_in: db_obj)
        await crud.update(db, id=1, obj_in=_UpdateSchema())
        db.commit.assert_awaited_once()
        db.flush.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_commit_false_only_flushes(self, crud, db, monkeypatch):
        monkeypatch.setattr(crud, "update_unlocked", lambda *, db_obj, obj_in: db_obj)
        await crud.update(db, id=1, obj_in=_UpdateSchema(), commit=False)
        db.commit.assert_not_awaited()
        db.flush.assert_awaited_once()


class TestRemove:
    @pytest.mark.asyncio
    async def test_commits_by_default(self, crud, db):
        await crud.remove(db, id=1)
        db.commit.assert_awaited_once()
        db.flush.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_commit_false_only_flushes(self, crud, db):
        await crud.remove(db, id=1, commit=False)
        db.commit.assert_not_awaited()
        db.flush.assert_awaited_once()
