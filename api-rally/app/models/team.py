from typing import List, Optional
from datetime import datetime
from sqlalchemy import DateTime, Integer, Boolean
from sqlalchemy.orm import Mapped, relationship, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList

from app.models.base import Base
from app.models.user import User


class Team(Base):
    __tablename__ = "teams"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(unique=True)

    times: Mapped[List[datetime]] = mapped_column(
        MutableList.as_mutable(ARRAY(DateTime(timezone=False))), default=[]
    )

    score_per_checkpoint: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])

    # Additional arrays needed for Rally functionality
    question_scores: Mapped[List[bool]] = mapped_column(ARRAY(Boolean), default=[])
    time_scores: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])
    pukes: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])
    skips: Mapped[List[int]] = mapped_column(ARRAY(Integer), default=[])

    # Card tracking
    card1: Mapped[int] = mapped_column(default=-1)
    card2: Mapped[int] = mapped_column(default=-1)
    card3: Mapped[int] = mapped_column(default=-1)

    total: Mapped[int] = mapped_column(default=0)
    classification: Mapped[int] = mapped_column(default=-1)

    members: Mapped[List[User]] = relationship()
    versus_group_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    
    # Activity relationships
    activity_results: Mapped[List["ActivityResult"]] = relationship("ActivityResult", back_populates="team")
