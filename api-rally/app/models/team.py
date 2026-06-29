from typing import List, Optional, TYPE_CHECKING
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, relationship, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList

from app.models.base import Base
from app.models.user import User
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.activity import ActivityResult


class Team(Base):
    __tablename__ = "teams"  # type: ignore[assignment]
    # Team name is unique within an event, not globally. access_code stays
    # globally unique so team login can resolve a team (and its event) from
    # the code alone.
    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_team_event_name"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column()
    access_code: Mapped[str] = mapped_column(unique=True, index=True)
    # Official team photo (R2 public URL). Shown on the team page, leaderboard
    # and team cards. Empty string when unset (falls back to a placeholder).
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # Event scoping: nullable so existing single-event rows remain valid.
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    times: Mapped[List[datetime]] = mapped_column(
        MutableList.as_mutable(ARRAY(DateTime(timezone=False))), default=[]
    )

    score_per_checkpoint: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])

    # Additional arrays needed for Rally functionality
    question_scores: Mapped[List[bool]] = mapped_column(ARRAY(Boolean), default=[])
    time_scores: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])
    pukes: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])
    skips: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])

    total: Mapped[int] = mapped_column(default=0)
    classification: Mapped[int] = mapped_column(default=-1)

    members: Mapped[List[User]] = relationship()
    versus_group_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    
    # Activity relationships
    activity_results: Mapped[List["ActivityResult"]] = relationship("ActivityResult", back_populates="team")
