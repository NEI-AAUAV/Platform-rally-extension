from typing import Any, ClassVar, Optional

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import mapped_column, Mapped, relationship

from app.models.base import Base
from app.core.config import settings


class RallyGuideAssignment(Base):
    """
    Links NEI users (guides) to Rally checkpoints.
    Mirrors RallyStaffAssignment: the row does not grant the guide role
    (that comes from the authentik group), it only records which checkpoint
    a guide is accompanying teams through.
    """
    # One assignment row per guide — create_or_update relies on this.
    __table_args__: ClassVar[Any] = (
        UniqueConstraint("user_id", name="uq_rally_guide_assignment_user_id"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Reference to NEI user (by ID, not foreign key to avoid coupling)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Reference to Rally checkpoint
    checkpoint_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"),
        nullable=True
    )

    # Relationship to checkpoint
    checkpoint = relationship("CheckPoint", back_populates="guide_assignments")
