from typing import Any, ClassVar, List, Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.rally_staff_assignment import RallyStaffAssignment
    from app.models.rally_guide_assignment import RallyGuideAssignment
    from app.models.activity import Activity
    from app.models.checkpoint_media import CheckpointMedia
    from app.models.checkpoint_guide_indication import CheckpointGuideIndication


class CheckPoint(Base):
    __tablename__ = "checkpoints"  # type: ignore[assignment]
    # Checkpoint order is unique within an event, not globally — different
    # editions can each have an "order 1" checkpoint.
    __table_args__: ClassVar[Any] = (
        UniqueConstraint("event_id", "order", name="uq_checkpoint_event_order"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(default=None)
    latitude: Mapped[float | None] = mapped_column(default=None)
    longitude: Mapped[float | None] = mapped_column(default=None)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    arrival_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    # Event scoping: nullable so existing single-event rows remain valid.
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    # Relationship to staff assignments
    staff_assignments: Mapped[List["RallyStaffAssignment"]] = relationship("RallyStaffAssignment", back_populates="checkpoint")

    guide_assignments: Mapped[List["RallyGuideAssignment"]] = relationship("RallyGuideAssignment", back_populates="checkpoint")
    
    # Relationship to activities
    activities: Mapped[List["Activity"]] = relationship("Activity", back_populates="checkpoint")

    media: Mapped[List["CheckpointMedia"]] = relationship(
        "CheckpointMedia",
        back_populates="checkpoint",
        cascade="all, delete-orphan",
        order_by="CheckpointMedia.order",
    )

    guide_indications: Mapped[List["CheckpointGuideIndication"]] = relationship(
        "CheckpointGuideIndication",
        back_populates="checkpoint",
        cascade="all, delete-orphan",
        order_by="CheckpointGuideIndication.order",
    )