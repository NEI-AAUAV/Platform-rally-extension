from datetime import datetime
from typing import Any, ClassVar, Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Integer, Float, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.team import Team
    from app.models.checkpoint import CheckPoint


class CheckpointArrival(Base):
    __tablename__ = "checkpoint_arrivals"  # type: ignore[assignment]
    __table_args__: ClassVar[tuple[Any, ...]] = (
        UniqueConstraint("team_id", "checkpoint_id", name="uq_arrival_team_checkpoint"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    checkpoint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    arrived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    team: Mapped["Team"] = relationship("Team")
    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint")
