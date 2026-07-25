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
    winner_row = MagicMock()
    winner_row.request_fingerprint = "fp-winner"
    winner_row.response_body = {"ok": True}
    db = _make_db(existing_after_race=winner_row)

    with pytest.raises(HTTPException) as exc:
        await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-loser")
    assert exc.value.status_code == 409


async def test_reserve_replays_when_race_winner_fingerprint_matches(monkeypatch):
    """The race loser finds the winner's row with a matching fingerprint ->
    replay the winner's response instead of erroring."""
    winner_row = MagicMock()
    winner_row.request_fingerprint = "fp-same"
    winner_row.response_body = {"cached": True}
    db = _make_db(existing_after_race=winner_row)

    reservation = await reserve_idempotency_key(db, endpoint="ep", key="k", fingerprint="fp-same")
    assert reservation.replay == {"cached": True}
    assert reservation.row is None


async def test_store_idempotent_response_noop_when_no_row():
    """A replay reservation (row=None) means there's nothing to persist —
    the store call must be a silent no-op."""
    db = MagicMock()
    db.commit = AsyncMock()
    reservation = IdempotencyReservation(replay={"already": "stored"})

    await store_idempotent_response(db, reservation, response_body={"new": "data"})

    db.commit.assert_not_awaited()
