from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import mapped_column, Mapped, relationship

from app.models.base import Base
from app.core.config import settings


class RallyStaffAssignment(Base):
    """
    Links NEI users to Rally checkpoints.
    This table only stores Rally-specific assignment data.
    """
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Reference to NEI user (by ID, not foreign key to avoid coupling)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Reference to Rally checkpoint
    # NOTE: Ensure that a database migration has renamed the table from 'check_point' to 'checkpoints'
    checkpoint_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id"),
        nullable=True
    )
    
    # Relationship to checkpoint
    checkpoint = relationship("CheckPoint", back_populates="staff_assignments")


