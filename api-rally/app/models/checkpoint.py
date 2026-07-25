from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.checkpoint_guide_indication import CheckpointGuideIndication
    from app.models.checkpoint_media import CheckpointMedia
    from app.models.rally_guide_assignment import RallyGuideAssignment
    from app.models.rally_staff_assignment import RallyStaffAssignment


class CheckPoint(Base):
    __tablename__ = "checkpoints"
    # Checkpoint order is unique within an event, not globally — different
    # editions can each have an "order 1" checkpoint.
    __table_args__: Any = (
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
    event_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )

    # Relationship to staff assignments
    staff_assignments: Mapped[list["RallyStaffAssignment"]] = relationship(
        "RallyStaffAssignment", back_populates="checkpoint"
    )

    guide_assignments: Mapped[list["RallyGuideAssignment"]] = relationship(
        "RallyGuideAssignment", back_populates="checkpoint"
    )

    # Relationship to activities
    activities: Mapped[list["Activity"]] = relationship("Activity", back_populates="checkpoint")

    media: Mapped[list["CheckpointMedia"]] = relationship(
        "CheckpointMedia",
        back_populates="checkpoint",
        cascade="all, delete-orphan",
        order_by="CheckpointMedia.order",
    )

    guide_indications: Mapped[list["CheckpointGuideIndication"]] = relationship(
        "CheckpointGuideIndication",
        back_populates="checkpoint",
        cascade="all, delete-orphan",
        order_by="CheckpointGuideIndication.order",
    )
