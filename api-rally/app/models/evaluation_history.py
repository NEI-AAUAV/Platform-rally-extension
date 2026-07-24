"""Evaluation audit-trail model.

Activity results are editable by staff, managers and admins after they are
first recorded. In a competition with prizes the first dispute ("staff changed
our score!") needs an answer, so every edit and every team contest is appended
as an immutable ``EvaluationHistory`` row: who, what changed, and when.

Rows are never mutated or deleted — they are the record of truth. Deleting the
underlying result cascades the history away (the result is gone, its audit
trail no longer anchors anything).
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class EvaluationAction(str, Enum):
    """What produced a history row. String-valued for DB storage."""

    # Staff/manager/admin edited an existing result's scoring fields.
    UPDATED = "updated"
    # A team disputed a result via the team-side "contest" button.
    CONTESTED = "contested"


class EvaluationHistory(Base):
    """One audit-trail entry for a change to (or dispute of) an activity result."""

    __tablename__ = "evaluation_history"
    __table_args__ = ({"schema": settings.SCHEMA_NAME},)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    result_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{settings.SCHEMA_NAME}.activity_results.id", ondelete="CASCADE"
        ),
        index=True,
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)

    # Who made the change. For staff/manager/admin edits this is the OIDC
    # subject + display name; for team contests it is the team id + name. Kept
    # denormalized (name copied in) so the trail stays readable even if the
    # user/team is later renamed or removed.
    editor_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    editor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Field-level diff: {field: {"before": <old>, "after": <new>}}. Empty for a
    # contest (no scoring fields changed) — the team's message goes in `note`.
    changes: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Free-form context: a team's contest reason, or an editor's note.
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<EvaluationHistory(id={self.id}, result_id={self.result_id}, "
            f"action='{self.action}')>"
        )
