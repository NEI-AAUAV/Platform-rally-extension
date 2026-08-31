"""Deterministic (mock-driven) coverage for the IntegrityError race branches
in `reserve_idempotency_key` and the no-op early return in
`store_idempotent_response`, complementing the genuinely-concurrent
Postgres-backed tests in app/tests/integration/test_idempotency_concurrency.py
(which can't reliably force one specific race outcome every run)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.api_v1.idempotency import (
    IdempotencyReservation,
    reserve_idempotency_key,
    store_idempotent_response,
)


class _FakeScalarsResult:
    def __init__(self, value):
        self._value = value

    def first(self):
        return self._value


def _make_db(existing_after_race):
    """A fake AsyncSession: first `_existing` lookup misses, flush raises
    IntegrityError, then the post-rollback `_existing` lookup returns
    `existing_after_race`."""
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock(side_effect=IntegrityError("dup", None, RuntimeError("duplicate key")))
    db.rollback = AsyncMock()
    db.commit = AsyncMock()

    call_count = {"n": 0}

    def _scalars(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return _FakeScalarsResult(None)  # initial pre-check: no existing row
        return _FakeScalarsResult(existing_after_race)

    db.scalars = AsyncMock(side_effect=_scalars)
    return db


async def test_reserve_reraises_when_race_loser_finds_nothing(monkeypatch):
    """If the post-rollback lookup still finds nothing, the original
    IntegrityError must propagate (should be impossible in practice, but the
    guard exists)."""
    db = _make_db(existing_after_race=None)

    with pytest.raises(IntegrityError):
        await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-a")


async def test_reserve_raises_conflict_when_race_winner_fingerprint_differs(monkeypatch):
    """The race loser finds the winner's row, but its fingerprint doesn't
    match its own payload -> 409, not a silent replay."""
    from datetime import UTC, datetime

    winner_row = MagicMock()
    winner_row.request_fingerprint = "fp-winner"
    winner_row.response_body = {"ok": True}
    winner_row.completed_at = datetime.now(UTC)
    db = _make_db(existing_after_race=winner_row)

    with pytest.raises(HTTPException) as exc:
        await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-loser")
    assert exc.value.status_code == 409


async def test_reserve_replays_when_race_winner_fingerprint_matches(monkeypatch):
    """The race loser finds the winner's row with a matching fingerprint ->
    replay the winner's response instead of erroring."""
    from datetime import UTC, datetime

    winner_row = MagicMock()
    winner_row.request_fingerprint = "fp-same"
    winner_row.response_body = {"cached": True}
    winner_row.completed_at = datetime.now(UTC)
    db = _make_db(existing_after_race=winner_row)

    reservation = await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-same")
    assert reservation.replay == {"cached": True}
    assert reservation.row is None


async def test_reserve_raises_in_flight_when_race_winner_not_yet_completed(monkeypatch):
    """C3: the race loser finds the winner's row, fingerprint matches, but the
    winner's write hasn't finished (completed_at is still None) -> 409
    in-flight, never a replay of the still-empty response_body."""
    winner_row = MagicMock()
    winner_row.request_fingerprint = "fp-same"
    winner_row.response_body = {}
    winner_row.completed_at = None
    db = _make_db(existing_after_race=winner_row)

    with pytest.raises(HTTPException) as exc:
        await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-same")
    assert exc.value.status_code == 409
    assert "Retry-After" in exc.value.headers


async def test_reserve_raises_in_flight_for_uncompleted_row_on_first_lookup(monkeypatch):
    """C3 primary path (no race): a request crashed after its reservation
    committed but before store_idempotent_response ran, leaving a durable row
    with completed_at=None and response_body={}. A retry must get 409
    in-flight, not model_validate({}) -> 500 forever."""
    stale_row = MagicMock()
    stale_row.request_fingerprint = "fp-a"
    stale_row.response_body = {}
    stale_row.completed_at = None

    db = MagicMock()
    db.scalars = AsyncMock(return_value=_FakeScalarsResult(stale_row))

    with pytest.raises(HTTPException) as exc:
        await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-a")
    assert exc.value.status_code == 409
    assert "Retry-After" in exc.value.headers


async def test_reserve_replays_completed_row_on_first_lookup(monkeypatch):
    """A genuinely finished row (completed_at set, real body) still replays
    normally — the new guard doesn't regress the happy path."""
    from datetime import UTC, datetime

    done_row = MagicMock()
    done_row.request_fingerprint = "fp-a"
    done_row.response_body = {"id": 42}
    done_row.completed_at = datetime.now(UTC)

    db = MagicMock()
    db.scalars = AsyncMock(return_value=_FakeScalarsResult(done_row))

    reservation = await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-a")
    assert reservation.replay == {"id": 42}


async def test_store_idempotent_response_sets_completed_at():
    """store_idempotent_response must stamp completed_at so the next replay
    lookup treats the row as finished."""
    row = MagicMock()
    row.completed_at = None
    reservation = IdempotencyReservation(row=row)
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    await store_idempotent_response(db, reservation, response_body={"id": 1})

    assert row.completed_at is not None
    assert row.response_body == {"id": 1}


async def test_store_idempotent_response_noop_when_no_row():
    """A replay reservation (row=None) means there's nothing to persist —
    the store call must be a silent no-op."""
    db = MagicMock()
    db.commit = AsyncMock()
    reservation = IdempotencyReservation(replay={"already": "stored"})

    await store_idempotent_response(db, reservation, response_body={"new": "data"})

    db.commit.assert_not_awaited()


async def test_purge_expired_idempotency_keys_deletes_and_commits(monkeypatch):
    """M13: the purge helper issues a DELETE scoped to completed, expired rows
    and commits, returning the row count."""
    from app.api.api_v1.idempotency import purge_expired_idempotency_keys

    db = AsyncMock()
    result = MagicMock()
    result.rowcount = 3
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()

    deleted = await purge_expired_idempotency_keys(db)

    assert deleted == 3
    db.execute.assert_awaited_once()
    db.commit.assert_awaited_once()


async def test_purge_expired_idempotency_keys_returns_zero_when_rowcount_none(monkeypatch):
    """A driver that doesn't report rowcount (None) must not crash the
    caller -- normalize to 0 rather than propagating None."""
    from app.api.api_v1.idempotency import purge_expired_idempotency_keys

    db = AsyncMock()
    result = MagicMock()
    result.rowcount = None
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()

    deleted = await purge_expired_idempotency_keys(db)

    assert deleted == 0
