"""Idempotency-key store for safely retryable write endpoints.

Staff evaluate submits are made from phones over flaky networks and may be
replayed by the client's offline queue. A bare upsert dedupes *rows* but a
retried submit still re-runs scoring (and, worse, a retry carrying a *different*
payload would silently overwrite the prior result). This table records each
processed ``Idempotency-Key`` alongside a fingerprint of the request and the
response that was returned, so a replay:

- with the *same* payload replays the stored response without re-scoring, and
- with a *different* payload is rejected (409) rather than clobbering state.

Keys are scoped by ``endpoint`` so a client key reused across two different
routes can't replay the wrong response.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class IdempotencyKey(Base):
    """One record per (endpoint, idempotency_key): the request fingerprint and
    the response to replay."""

    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("endpoint", "idempotency_key", name="uq_idempotency_keys_endpoint_key"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Logical route this key belongs to (e.g. "evaluate_team_activity").
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    # Client-supplied key; unique per endpoint.
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # sha256 hex of the normalized request (path params + body). A replay whose
    # fingerprint differs from the stored one is a key-reuse bug → 409.
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    # The serialized response body to replay verbatim.
    response_body: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return f"<IdempotencyKey(endpoint='{self.endpoint}', key='{self.idempotency_key}')>"
