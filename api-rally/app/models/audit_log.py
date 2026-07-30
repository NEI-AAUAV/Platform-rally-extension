"""General audit-trail model.

``EvaluationHistory`` covers evaluation edits and contests only, and is bolted
to ``activity_results.id`` by FK with an ``ON DELETE CASCADE`` — the right
semantics for a score dispute, wrong for actions that don't hang off a result
row. ``AuditLog`` is the sibling for everything else worth a "who did what,
when" trail in a competition with prizes: settings changes, badge grants,
staff reassignment, check-ins, exports.

Rows are never mutated or deleted — they are the record of truth.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class AuditLog(Base):
    """One audit-trail entry for a non-evaluation administrative action."""

    __tablename__ = "audit_log"
    __table_args__ = ({"schema": settings.SCHEMA_NAME},)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Nullable: some actions (e.g. a global settings change before any event
    # exists) aren't scoped to a specific rally edition.
    event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # Who performed the action. Denormalized (name copied in) so the trail
    # stays readable even if the user/team is later renamed or removed.
    actor_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "staff" | "team" | "system" — distinguishes an OIDC staff actor from a
    # team self-service action (e.g. self-check-in) or an automated process.
    actor_kind: Mapped[str] = mapped_column(String(20), nullable=False)

    # What happened, e.g. "rally_settings.updated", "badge.granted",
    # "export.leaderboard". Dot-namespaced so the read endpoint can filter by
    # prefix without a fixed enum that has to be extended for every new action.
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # What the action was performed on, e.g. target_type="checkpoint",
    # target_id="3". target_id is a string, not a FK, because targets span
    # multiple tables (settings, badges, staff assignments, checkpoints...)
    # and some actions (an export) have no single row to point at.
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Field-level diff: {field: {"before": <old>, "after": <new>}}. Empty for
    # actions with no field-level change (e.g. a check-in or an export).
    changes: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The request that produced this row, when known — ties the audit trail
    # back to the structured logs for that request (see
    # app.core.logging.bind_request_context).
    request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        default=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, action='{self.action}', "
            f"target='{self.target_type}:{self.target_id}')>"
        )
