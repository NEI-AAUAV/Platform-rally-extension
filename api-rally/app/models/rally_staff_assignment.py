from typing import Any

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base


class RallyStaffAssignment(Base):
    """
    Links NEI users to Rally checkpoints.
    This table only stores Rally-specific assignment data.
    """

    # One row per (user, post). Without it nothing stopped a second
    # assignment for the same pair, and ``get_by_user_id`` would then return
    # an arbitrary one of them. ``RallyGuideAssignment`` has carried the
    # equivalent constraint from the start.
    __table_args__: Any = (
        UniqueConstraint("user_id", "checkpoint_id", name="uq_staff_assignment_user_checkpoint"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Reference to NEI user (by ID, not foreign key to avoid coupling)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Reference to Rally checkpoint
    # NOTE: Ensure that a database migration has renamed the table from
    # 'check_point' to 'checkpoints'
    checkpoint_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"), nullable=True
    )

    # Relationship to checkpoint
    checkpoint = relationship("CheckPoint", back_populates="staff_assignments")
