"""Idempotency helpers for retryable write endpoints.

Usage (see ``evaluate_team_activity``):

    reservation = await reserve_idempotency_key(
        db, endpoint="evaluate_team_activity", key=key, fingerprint=fp
    )
    if reservation.replay is not None:
        return reservation.replay          # duplicate: replay stored response
    ...run the write...
    await store_idempotent_response(db, reservation, response_body=body)

A reused key carrying a *different* request fingerprint raises 409 — that is a
client bug (the same logical submit must always send the same key), and silently
overwriting the prior result is exactly the hazard this guards against.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.idempotency_key import IdempotencyKey

# M13: rows never expired -- the table grew unbounded. Clients only need a
# key to survive long enough to dedupe their own retry window (seconds to
# minutes in practice); keeping rows for a week is generous slack.
IDEMPOTENCY_KEY_TTL = timedelta(days=7)


def compute_fingerprint(payload: Any) -> str:
    """Stable sha256 of a JSON-serializable request payload."""
    encoded = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass
class IdempotencyReservation:
    """Result of reserving a key.

    - ``replay`` set  -> this key was already processed; return it verbatim.
    - ``row`` set     -> a fresh reservation this request owns; fill it in after
                         the write via ``store_idempotent_response``.
    """

    replay: dict[str, Any] | None = None
    row: IdempotencyKey | None = None


async def _existing(db: AsyncSession, *, endpoint: str, key: str) -> IdempotencyKey | None:
    stmt = select(IdempotencyKey).where(
        IdempotencyKey.endpoint == endpoint,
        IdempotencyKey.idempotency_key == key,
    )
    return (await db.scalars(stmt)).first()


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Idempotency-Key reused with a different request payload",
    )


def _in_flight() -> HTTPException:
    # C3: a reserved-but-not-completed row means the original request is
    # still running, or crashed after its reservation was already committed
    # by the write's own db.commit(). Either way response_body is still the
    # {} placeholder — replaying it would fail model_validate() and 500
    # forever. Ask the client to retry shortly instead.
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Request with this Idempotency-Key is still being processed",
        headers={"Retry-After": "2"},
    )


async def reserve_idempotency_key(
    db: AsyncSession, *, endpoint: str, key: str, fingerprint: str
) -> IdempotencyReservation:
    """Look up or reserve an idempotency key.

    Returns a reservation whose ``replay`` is set when the key was already
    processed (same fingerprint) or raises 409 on a fingerprint mismatch. On a
    first-seen key it inserts a reservation row (with an empty response) and
    returns it as ``row`` for the caller to fill in after the write. The row is
    flushed (not committed) so it becomes visible before the write's own commit.

    A row whose ``completed_at`` is still unset is in-flight (or crashed
    after commit before finishing) — never replay it; raise 409 instead.
    """
    found = await _existing(db, endpoint=endpoint, key=key)
    if found is not None:
        if found.request_fingerprint != fingerprint:
            raise _conflict()
        if found.completed_at is None:
            raise _in_flight()
        # Defensive guard: never replay an empty body even if completed_at
        # was somehow set without one.
        if not found.response_body:
            raise _in_flight()
        return IdempotencyReservation(replay=found.response_body)

    row = IdempotencyKey(
        endpoint=endpoint,
        idempotency_key=key,
        request_fingerprint=fingerprint,
        response_body={},
        status_code=status.HTTP_200_OK,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # A concurrent request reserved the same key first. Roll back the failed
        # insert and treat theirs as authoritative.
        await db.rollback()
        found = await _existing(db, endpoint=endpoint, key=key)
        if found is None:
            raise
        if found.request_fingerprint != fingerprint:
            raise _conflict() from None
        if found.completed_at is None or not found.response_body:
            raise _in_flight() from None
        return IdempotencyReservation(replay=found.response_body)

    return IdempotencyReservation(row=row)


async def store_idempotent_response(
    db: AsyncSession,
    reservation: IdempotencyReservation,
    *,
    response_body: dict[str, Any],
    status_code: int = status.HTTP_200_OK,
) -> None:
    """Persist the response the caller produced onto its reserved row."""
    if reservation.row is None:
        return
    reservation.row.response_body = response_body
    reservation.row.status_code = status_code
    reservation.row.completed_at = datetime.now(UTC)
    db.add(reservation.row)
    # This is the single commit for an idempotent write: the reservation,
    # domain mutation and replayable response become durable atomically.
    await db.commit()


async def purge_expired_idempotency_keys(
    db: AsyncSession, *, ttl: timedelta = IDEMPOTENCY_KEY_TTL
) -> int:
    """Delete idempotency rows older than ``ttl``. Returns the row count deleted.

    M13: nothing ever pruned this table, so it grows without bound. Only
    completed rows are eligible -- an in-flight row (``completed_at IS NULL``)
    must never be purged out from under a request that is still, or was
    recently, writing it; it can only ever be old because it's stuck, and a
    stuck row is a separate incident to investigate, not silently deleted.
    """
    cutoff = datetime.now(UTC) - ttl
    result = await db.execute(
        delete(IdempotencyKey).where(
            IdempotencyKey.completed_at.is_not(None),
            IdempotencyKey.completed_at < cutoff,
        )
    )
    await db.commit()
    return int(getattr(result, "rowcount", 0) or 0)
