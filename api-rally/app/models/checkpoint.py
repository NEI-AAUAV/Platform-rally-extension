from typing import List
from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CheckPoint(Base):
    __tablename__ = "checkpoints"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(default=None)
    latitude: Mapped[float | None] = mapped_column(default=None)
    longitude: Mapped[float | None] = mapped_column(default=None)
    order: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    
    # Relationship to staff assignments
    staff_assignments: Mapped[List["RallyStaffAssignment"]] = relationship("RallyStaffAssignment", back_populates="checkpoint")
    
    # Relationship to activities
    activities: Mapped[List["Activity"]] = relationship("Activity", back_populates="checkpoint")