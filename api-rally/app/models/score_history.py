"""Team score history.

A append-only log of a team's running total over the course of an event, one
row written whenever the team's total changes. It powers the post-event replay
(animated leaderboard evolution): the timeline is reconstructed by ordering
these rows by ``recorded_at``.

Kept separate from the live scoring tables so recording history never competes
with or complicates the hot scoring path.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class TeamScoreHistory(Base):
    """One snapshot of a team's total at a point in time."""

    __tablename__ = "team_score_history"  # type: ignore[assignment]
    __table_args__ = (  # type: ignore[assignment]
        # Replay reads a whole event's timeline in chronological order.
        Index("ix_score_history_event_time", "event_id", "recorded_at"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
