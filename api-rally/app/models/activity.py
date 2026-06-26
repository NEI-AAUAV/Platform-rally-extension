"""
Activity models for Rally extension
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional, Union
import uuid

from app.models.base import Base
from app.core.config import settings


class Activity(Base):
    """Base activity model"""
    __tablename__ = "activities"  # type: ignore[assignment]
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Class name of the activity type
    checkpoint_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"), nullable=False)
    # Event scoping: nullable so existing single-event rows remain valid; new
    # rows are stamped with the current event id.
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    # Configuration specific to activity type
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    
    # Activity status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    checkpoint = relationship("CheckPoint", back_populates="activities")
    results = relationship("ActivityResult", back_populates="activity", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Activity(id={self.id}, name='{self.name}', type='{self.activity_type}')>"


class ActivityResult(Base):
    """Activity result model - stores team performance for each activity"""
    __tablename__ = "activity_results"  # type: ignore[assignment]
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.activities.id"), nullable=False)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"), nullable=False)
    
    # Result data - varies by activity type
    result_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    
    # Calculated scores
    time_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # For time-based activities
    points_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # For score-based activities
    boolean_score: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # For boolean activities
    team_vs_result: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 'win', 'lose', 'draw'
    
    # Special scoring modifiers
    extra_shots: Mapped[int] = mapped_column(Integer, default=0)  # Extra shots taken
    penalties: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)  # Various penalties
    
    # Final calculated score
    final_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Status
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    activity = relationship("Activity", back_populates="results")
    team = relationship("Team", back_populates="activity_results")
    
    def __repr__(self) -> str:
        return f"<ActivityResult(id={self.id}, activity_id={self.activity_id}, team_id={self.team_id})>"


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


class RallyEvent(Base):
    """An event edition (a single rally / peddy-paper / competition).

    This is the scoping entity: teams, checkpoints, activities, staff
    assignments, badges and settings all hang off an event via ``event_id``.
    Exactly one event is flagged ``is_current`` and is what public/unscoped
    reads resolve to. Creating a new event no longer requires wiping the DB.
    """
    __tablename__ = "rally_events"  # type: ignore[assignment]

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # URL-friendly stable identifier, unique across events.
    slug: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True)
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
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<RallyEvent(id={self.id}, name='{self.name}', type='{self.event_type}', current={self.is_current})>"
