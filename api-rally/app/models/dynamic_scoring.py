"""Dynamic scoring models (D4).

DynamicRule  — an event-wide counter that shows up in every staff evaluation
               form, alongside the activity's own config.penalty_counters /
               config.bonus_counters. ``rule_type`` says which side it is on:
               "penalty_counter" ("cada X = -N pontos") or "bonus_counter"
               ("cada X = +N pontos"). It is fixed at creation, because
               results already scored carry the key it produced.
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

#: An event-wide penalty counter: each occurrence deducts ``points``.
PENALTY_COUNTER_RULE_TYPE = "penalty_counter"
#: An event-wide bonus counter: each occurrence adds ``points``.
BONUS_COUNTER_RULE_TYPE = "bonus_counter"
#: Every rule_type a rule may be created with.
RULE_TYPES = (PENALTY_COUNTER_RULE_TYPE, BONUS_COUNTER_RULE_TYPE)


class DynamicRule(Base):
    """An event-wide counter shown in every staff evaluation.

    ``name`` is the label staff see, ``points`` is the magnitude applied per
    occurrence (stored positive whichever side it is on), ``is_active``
    controls whether it appears in the form. Staff submit the *count*; the
    server prices it and files it under ``g_<id>`` in the result's penalties
    dict for a penalty rule, or ``gb_<id>`` in its bonuses dict for a bonus
    rule. The two prefixes keep the namespaces from ever colliding.
    """

    __tablename__ = "dynamic_rules"
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(
        String(64), nullable=False, default=PENALTY_COUNTER_RULE_TYPE
    )
    points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Two independent axes, and conflating them is what broke the admin's
    # toggle: ``is_active`` is the on/off switch a person flips, ``deleted_at``
    # is the tombstone. Neither deletes the row — results already scored carry
    # the key this rule produced, and pricing that key back is what keeps an
    # edit or a retroactive recompute from failing on it.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )


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
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=False,
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
