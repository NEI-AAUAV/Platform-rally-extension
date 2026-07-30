"""
Activity models for Rally extension
"""

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base


class Activity(Base):
    """Base activity model"""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    activity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # Class name of the activity type
    # nullable for global activities (D3); checkpoint-scoped activities keep a non-null value
    checkpoint_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"), nullable=True
    )
    # Event scoping: nullable so existing single-event rows remain valid; new
    # rows are stamped with the current event id.
    event_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    # Configuration specific to activity type
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Activity status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Global activity flag (D3): when True the activity is available at every
    # checkpoint and checkpoint_id is ignored/null.
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Optional time window (D3): activity is only available between these times.
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    checkpoint = relationship("CheckPoint", back_populates="activities")
    results = relationship(
        "ActivityResult", back_populates="activity", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Activity(id={self.id}, name='{self.name}', type='{self.activity_type}')>"


class ActivityResult(Base):
    """Activity result model - stores team performance for each activity"""

    __tablename__ = "activity_results"
    __table_args__ = (
        UniqueConstraint("activity_id", "team_id", name="uq_activity_results_activity_id_team_id"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.activities.id"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"), nullable=False
    )

    # Result data - varies by activity type
    # MutableDict/MutableList wrappers below make in-place mutations (e.g.
    # penalties[key] += n in ScoringService.apply_penalty) mark the column
    # dirty; plain JSON columns silently lose them.
    result_data: Mapped[dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSON), nullable=False, default=dict
    )

    # Calculated scores
    time_score: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # For time-based activities
    points_score: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # For score-based activities
    boolean_score: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )  # For boolean activities
    team_vs_result: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # 'win', 'lose', 'draw'

    # Special scoring modifiers
    extra_shots: Mapped[int] = mapped_column(Integer, default=0)  # Extra shots taken
    penalties: Mapped[dict[str, int]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )  # Various penalties

    # Final calculated score
    final_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Deferred judging support (B3)
    # media_urls: list of R2 URLs uploaded during capture phase
    media_urls: Mapped[list[str]] = mapped_column(
        MutableList.as_mutable(JSON), nullable=False, default=list
    )
    # judgment_status: None = normal result; "pending_judgment" = captured,
    # awaiting judge; "judged" = judged
    judgment_status: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    activity = relationship("Activity", back_populates="results")
    team = relationship("Team", back_populates="activity_results")

    def append_capture(self, media_urls: list[str]) -> None:
        """Append newly-uploaded media to an existing pending-judgment capture."""
        self.media_urls = self.media_urls + media_urls
        self.judgment_status = "pending_judgment"
        self.is_completed = True

    def mark_judged(self, *, points: float, notes: str | None) -> None:
        """Score a pending-judgment result and close out the judging lifecycle.

        The only writer of these fields for a deferred-judged result — callers
        must not set them directly.
        """
        self.result_data = {"points": points, "notes": notes or ""}
        self.points_score = int(points)
        self.final_score = points
        self.judgment_status = "judged"
        self.is_completed = True
        self.completed_at = datetime.now(UTC)

    def __repr__(self) -> str:
        return (
            f"<ActivityResult(id={self.id}, activity_id={self.activity_id}, "
            f"team_id={self.team_id})>"
        )


class EventType(str, Enum):
    """Kind of event. Drives terminology and which mechanics are available.

    - ``rally_tascas``: the classic pub-crawl rally (drinking mechanics:
      pukes/skips/extra shots apply).
    - ``peddy_paper``: a city route / treasure-hunt style game (no drinking
      mechanics).
    - ``generic``: any other checkpoint-based competition.
    """

    RALLY_TASCAS = "rally_tascas"
    PEDDY_PAPER = "peddy_paper"
    GENERIC = "generic"
    OLYMPIC = "olympic"


class RallyEvent(Base):
    """An event edition (a single rally / peddy-paper / competition).

    This is the scoping entity: teams, checkpoints, activities, staff
    assignments, badges and settings all hang off an event via ``event_id``.
    Exactly one event is flagged ``is_current`` and is what public/unscoped
    reads resolve to. Creating a new event no longer requires wiping the DB.
    """

    __tablename__ = "rally_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # URL-friendly stable identifier, unique across events.
    slug: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # What kind of event this is (terminology + available mechanics).
    event_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EventType.RALLY_TASCAS.value
    )

    # Event configuration
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Event status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)  # Only one current event

    # Event timing
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Olympic rotation schedule (D2): JSON array of rounds, each round being a
    # list of (team_id, checkpoint_id) pairs. Generated by the round-robin
    # endpoint and stored here for reference/display.
    rotation_schedule: Mapped[Any | None] = mapped_column(JSON, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return (
            f"<RallyEvent(id={self.id}, name='{self.name}', type='{self.event_type}', "
            f"current={self.is_current})>"
        )
