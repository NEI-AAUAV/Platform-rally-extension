"""DB-backed tests for the small remaining gaps in app.crud.crud_checkpoint."""

from unittest.mock import AsyncMock

import pytest

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import make_event as _make_event


async def test_get_max_order_returns_zero_when_no_checkpoints(pg_session):
    await _make_event(pg_session)
    result = await crud_checkpoint.get_max_order(pg_session)
    assert result == 0


async def test_get_max_order_returns_highest_order(pg_session):
    await _make_event(pg_session)
    await crud_checkpoint.create(pg_session, obj_in=CheckPointCreate(name="CP1", order=1))
    await crud_checkpoint.create(pg_session, obj_in=CheckPointCreate(name="CP3", order=3))

    result = await crud_checkpoint.get_max_order(pg_session)
    assert result == 3


async def test_reorder_checkpoints_commits_only_after_both_phases(pg_session, monkeypatch):
    await _make_event(pg_session)
    cp1 = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
    )
    cp2 = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name="CP2", order=2), commit=True
    )

    original_flush = pg_session.flush
    flush_calls = 0

    async def fail_second_flush(*args, **kwargs):
        nonlocal flush_calls
        flush_calls += 1
        if flush_calls == 2:
            raise RuntimeError("final-order flush failed")
        return await original_flush(*args, **kwargs)

    commit_spy = AsyncMock(wraps=pg_session.commit)
    monkeypatch.setattr(pg_session, "flush", fail_second_flush)
    monkeypatch.setattr(pg_session, "commit", commit_spy)

    with pytest.raises(RuntimeError, match="final-order flush failed"):
        await crud_checkpoint.reorder_checkpoints(pg_session, {cp1.id: 2, cp2.id: 1})

    # The old implementation had already committed the negative staging
    # orders at this point. The fixed implementation has made no commit yet.
    assert commit_spy.await_count == 0

    # Simulate request/session cleanup after the failed transaction and verify
    # that the only durable state is the pre-reorder positive ordering.
    monkeypatch.setattr(pg_session, "flush", original_flush)
    await pg_session.rollback()
    await pg_session.refresh(cp1)
    await pg_session.refresh(cp2)
    assert cp1.order == 1
    assert cp2.order == 2


async def test_reorder_checkpoints_uses_single_commit_on_success(pg_session, monkeypatch):
    await _make_event(pg_session)
    cp1 = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
    )
    cp2 = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name="CP2", order=2), commit=True
    )

    commit_spy = AsyncMock(wraps=pg_session.commit)
    monkeypatch.setattr(pg_session, "commit", commit_spy)

    await crud_checkpoint.reorder_checkpoints(pg_session, {cp1.id: 2, cp2.id: 1})

    assert commit_spy.await_count == 1
    await pg_session.refresh(cp1)
    await pg_session.refresh(cp2)
    assert cp1.order == 2
    assert cp2.order == 1
