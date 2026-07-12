"""Concurrency / double-submit tests for the idempotency key store.

These exercise the *real* race the store defends against: two submits carrying
the same Idempotency-Key arriving at once (a phone's offline queue retrying
before the first response lands). The unit tests in
``app/tests/unit/test_idempotency.py`` only cover fingerprint hashing — they
never touch the DB, so they can't prove the unique constraint + IntegrityError
rollback path actually serializes concurrent reservations.

Runs against the shared test-Postgres schema (``_pg_engine``): SQLite does not
enforce a UNIQUE constraint reliably under genuinely concurrent writers, so a
real Postgres backend is required to make the assertion meaningful. Skips when
Postgres is unavailable, like the rest of the ``integration/`` suite.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.api_v1.idempotency import (
    compute_fingerprint,
    reserve_idempotency_key,
    store_idempotent_response,
)
from app.models.idempotency_key import IdempotencyKey

pytestmark = pytest.mark.asyncio

_ENDPOINT = "evaluate_team_activity"


async def _reserve_in_own_session(maker, *, key: str, fingerprint: str):
    """Reserve the key on a brand-new session (its own asyncpg connection).

    Each concurrent submit in production has its own request-scoped session, so
    the test must too — sharing one AsyncSession would serialize the writes and
    defeat the point.
    """
    async with maker() as session:
        reservation = await reserve_idempotency_key(
            session, endpoint=_ENDPOINT, key=key, fingerprint=fingerprint
        )
        if reservation.row is not None:
            # Winner: finalize its row exactly like the endpoint would.
            await store_idempotent_response(
                session, reservation, response_body={"ok": True}
            )
            return "reserved"
        return "replayed"


async def test_concurrent_same_key_reserves_exactly_once(_pg_engine):
    """Two parallel submits with the same key: one reserves, one replays.

    The loser must hit the IntegrityError branch (unique constraint violation),
    roll back, and fall through to replaying the winner's row — never a second
    independent reservation, which would let scoring run twice.
    """
    maker = async_sessionmaker(_pg_engine, expire_on_commit=False)
    fp = compute_fingerprint({"team_id": 1, "activity_id": 2, "score": 10})
    key = "concurrent-key-1"

    outcomes = await asyncio.gather(
        _reserve_in_own_session(maker, key=key, fingerprint=fp),
        _reserve_in_own_session(maker, key=key, fingerprint=fp),
    )

    assert sorted(outcomes) == ["replayed", "reserved"], (
        f"expected exactly one reservation and one replay, got {outcomes}"
    )

    # And exactly one row exists in the store for that (endpoint, key).
    async with maker() as session:
        rows = (
            await session.scalars(
                select(IdempotencyKey).where(
                    IdempotencyKey.endpoint == _ENDPOINT,
                    IdempotencyKey.idempotency_key == key,
                )
            )
        ).all()
    assert len(rows) == 1


async def test_high_fanout_same_key_reserves_exactly_once(_pg_engine):
    """A burst of N simultaneous retries still yields a single reservation."""
    maker = async_sessionmaker(_pg_engine, expire_on_commit=False)
    fp = compute_fingerprint({"team_id": 3, "activity_id": 4, "score": 5})
    key = "concurrent-key-burst"

    outcomes = await asyncio.gather(
        *(
            _reserve_in_own_session(maker, key=key, fingerprint=fp)
            for _ in range(8)
        )
    )

    assert outcomes.count("reserved") == 1, (
        f"expected exactly one winner across the burst, got {outcomes}"
    )
    assert outcomes.count("replayed") == 7

    async with maker() as session:
        rows = (
            await session.scalars(
                select(IdempotencyKey).where(
                    IdempotencyKey.endpoint == _ENDPOINT,
                    IdempotencyKey.idempotency_key == key,
                )
            )
        ).all()
    assert len(rows) == 1


async def test_concurrent_same_key_different_payload_conflicts(_pg_engine):
    """Same key, divergent payloads racing: the loser sees the winner's
    fingerprint mismatch and is rejected with 409 rather than clobbering it."""
    from fastapi import HTTPException

    maker = async_sessionmaker(_pg_engine, expire_on_commit=False)
    key = "concurrent-key-divergent"
    fp_a = compute_fingerprint({"team_id": 1, "score": 10})
    fp_b = compute_fingerprint({"team_id": 1, "score": 999})

    async def _attempt(fingerprint: str):
        try:
            return await _reserve_in_own_session(
                maker, key=key, fingerprint=fingerprint
            )
        except HTTPException as exc:
            return exc.status_code

    outcomes = await asyncio.gather(_attempt(fp_a), _attempt(fp_b))

    # Exactly one reservation wins; the other either lost the race to a
    # different fingerprint (409) or — if it won — the sibling is the 409.
    assert outcomes.count("reserved") == 1
    assert 409 in outcomes

    async with maker() as session:
        rows = (
            await session.scalars(
                select(IdempotencyKey).where(
                    IdempotencyKey.endpoint == _ENDPOINT,
                    IdempotencyKey.idempotency_key == key,
                )
            )
        ).all()
    assert len(rows) == 1
