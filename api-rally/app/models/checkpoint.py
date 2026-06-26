from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.rally_staff_assignment import RallyStaffAssignment
    from app.models.activity import Activity


class CheckPoint(Base):
    __tablename__ = "checkpoints"  # type: ignore[assignment]
    # Checkpoint order is unique within an event, not globally — different
    # editions can each have an "order 1" checkpoint.
    __table_args__ = (
        UniqueConstraint("event_id", "order", name="uq_checkpoint_event_order"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(default=None)
    latitude: Mapped[float | None] = mapped_column(default=None)
    longitude: Mapped[float | None] = mapped_column(default=None)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    # Event scoping: nullable so existing single-event rows remain valid.
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    # Relationship to staff assignments
    staff_assignments: Mapped[List["RallyStaffAssignment"]] = relationship("RallyStaffAssignment", back_populates="checkpoint")
    
    # Relationship to activities
    activities: Mapped[List["Activity"]] = relationship("Activity", back_populates="checkpoint")