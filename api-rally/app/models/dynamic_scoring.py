"""Dynamic scoring models (D4).

DynamicRule  — an event-wide penalty counter ("cada X = -N pontos") that shows
               up in every staff evaluation form, alongside the activity's own
               config.penalty_counters. rule_type is fixed at "penalty_counter".
DynamicAward — a score adjustment folded into team.total by
               ScoringService.update_team_scores(). Two sources:
               - admin one-off bonus/penalty for a team;
               - automatic: the shortfall when an activity's penalties exceed
                 its points (activity_result_id is set), so the excess still
                 reaches team.total instead of vanishing at the per-activity
                 floor.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base

#: The only rule_type there is now — an event-wide penalty counter.
PENALTY_COUNTER_RULE_TYPE = "penalty_counter"


class DynamicRule(Base):
    """An event-wide penalty counter shown in every staff evaluation.

    ``name`` is the label staff see, ``points`` is the magnitude deducted per
    occurrence (stored positive), ``is_active`` controls whether it appears in
    the form. The staff form multiplies the entered count by ``points`` and
    submits the total under the key ``g_<id>`` in the result's penalties dict.
    """

    __tablename__ = "dynamic_rules"
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(
        String(64), nullable=False, default=PENALTY_COUNTER_RULE_TYPE
    )
    points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DynamicAward(Base):
    """A one-off manual score adjustment applied to a specific team.

    Admin creates one per team per occasion (e.g. "creativity bonus"). The
    ScoringService folds all active awards into a team's total so they appear
    on the leaderboard without needing an ActivityResult row.
    """

    __tablename__ = "dynamic_awards"
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Set when this award is the auto-recorded shortfall for an activity result
    # whose penalties exceeded its points. One such award per result; removed
    # when the result is deleted or its penalties no longer overflow.
    activity_result_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.activity_results.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    points: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # When the award was issued. Feeds Team.last_scored_at so an award moves a
    # team's tie-break timestamp the same way an activity result does.
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
