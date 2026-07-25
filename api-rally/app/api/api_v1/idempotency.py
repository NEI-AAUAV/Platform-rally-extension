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
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.idempotency_key import IdempotencyKey


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


async def reserve_idempotency_key(
    db: AsyncSession, *, endpoint: str, key: str, fingerprint: str
) -> IdempotencyReservation:
    """Look up or reserve an idempotency key.

    Returns a reservation whose ``replay`` is set when the key was already
    processed (same fingerprint) or raises 409 on a fingerprint mismatch. On a
    first-seen key it inserts a reservation row (with an empty response) and
    returns it as ``row`` for the caller to fill in after the write. The row is
    flushed (not committed) so it becomes visible before the write's own commit.
    """
    found = await _existing(db, endpoint=endpoint, key=key)
    if found is not None:
        if found.request_fingerprint != fingerprint:
            raise _conflict()
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
            raise _conflict()
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
    db.add(reservation.row)
    await db.commit()
