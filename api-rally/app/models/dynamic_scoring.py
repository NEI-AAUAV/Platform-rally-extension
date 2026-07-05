"""Dynamic scoring models (D4).

DynamicRule  — configurable per-event scoring rules (not yet auto-evaluated;
               stored for future evaluator automation and visible in admin UI).
DynamicAward — one-off manual bonus/penalty applied by admin to a team.
               Picked up by ScoringService.update_team_scores().
"""
from typing import Any, ClassVar, Optional
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.core.config import settings


class DynamicRule(Base):
    """A configurable rule that describes how a bonus or penalty may be earned.

    Rules are descriptive metadata: what triggers the award, the value, and
    whether it fires automatically or requires a manual admin action. The
    ``rule_type`` is a free-form tag (e.g. "first_arrival", "bonus", "penalty").
    """
    __tablename__ = "dynamic_rules"  # type: ignore[assignment]
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(64), nullable=False, default="bonus")
    points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_automatic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DynamicAward(Base):
    """A one-off manual score adjustment applied to a specific team.

    Admin creates one per team per occasion (e.g. "creativity bonus"). The
    ScoringService folds all active awards into a team's total so they appear
    on the leaderboard without needing an ActivityResult row.
    """
    __tablename__ = "dynamic_awards"  # type: ignore[assignment]
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    rule_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.dynamic_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    points: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
