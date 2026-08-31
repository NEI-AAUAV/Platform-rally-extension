"""DB-backed tests for the small remaining gaps in app.crud.crud_checkpoint:
get_max_order()."""

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
