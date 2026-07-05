"""Team badge model.

Rally badges are *computed*, not configured: a background worker evaluates
scoring events and awards badges, so there is no separate badge-definition
table (unlike the gamification system's DB-seeded catalogue). The badge type is
a code-level enum and each row records one award to one team.

Badges are permanent — once earned they are never revoked, even if the
underlying result is later edited or deleted.
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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class BadgeType(str, Enum):
    """All badge types a team can earn. String-valued for DB storage."""

    # Won a head-to-head (TeamVs) match.
    HEAD_TO_HEAD_WIN = "head_to_head_win"
    # First team to complete a given activity.
    FIRST_TO_COMPLETE_ACTIVITY = "first_to_complete_activity"
    # First team to complete every activity of a checkpoint.
    FIRST_TO_COMPLETE_CHECKPOINT = "first_to_complete_checkpoint"


class TeamBadge(Base):
    """A single badge awarded to a team."""

    __tablename__ = "team_badges"  # type: ignore[assignment]
    __table_args__ = (
        # A team can hold a given badge for a given scope at most once. The
        # scope is whichever of activity_id / checkpoint_id the badge uses;
        # global badges (both NULL) dedupe in code.
        UniqueConstraint(
            "team_id",
            "badge_type",
            "activity_id",
            "checkpoint_id",
            name="uq_team_badge_scope",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    badge_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # The activity that earned the badge, when the badge is activity-scoped.
    activity_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )
    # The checkpoint that earned the badge, when the badge is checkpoint-scoped.
    checkpoint_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )
    # Free-form context for rendering (e.g. opponent team, completion time).
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
