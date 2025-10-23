"""
Activity models for Rally extension
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from typing import Dict, Any, Optional, Union
import uuid

from app.models.base import Base
from app.core.config import settings


class Activity(Base):
    """Base activity model"""
    __tablename__ = "activities"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Class name of the activity type
    checkpoint_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"), nullable=False)
    
    # Configuration specific to activity type
    config: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    
    # Activity status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    checkpoint = relationship("CheckPoint", back_populates="activities")
    results = relationship("ActivityResult", back_populates="activity", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Activity(id={self.id}, name='{self.name}', type='{self.activity_type}')>"


class ActivityResult(Base):
    """Activity result model - stores team performance for each activity"""
    __tablename__ = "activity_results"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.activities.id"), nullable=False)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"), nullable=False)
    
    # Result data - varies by activity type
    result_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    
    # Calculated scores
    time_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # For time-based activities
    points_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # For score-based activities
    boolean_score: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # For boolean activities
    team_vs_result: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 'win', 'lose', 'draw'
    
    # Special scoring modifiers
    extra_shots: Mapped[int] = mapped_column(Integer, default=0)  # Extra shots taken
    penalties: Mapped[Dict[str, int]] = mapped_column(JSON, default=dict)  # Various penalties
    
    # Final calculated score
    final_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Status
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    activity = relationship("Activity", back_populates="results")
    team = relationship("Team", back_populates="activity_results")
    
    def __repr__(self):
        return f"<ActivityResult(id={self.id}, activity_id={self.activity_id}, team_id={self.team_id})>"


class RallyEvent(Base):
    """Rally event configuration"""
    __tablename__ = "rally_events"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Event configuration
    config: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    
    # Event status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)  # Only one current event
    
    # Event timing
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<RallyEvent(id={self.id}, name='{self.name}', active={self.is_active})>"
