from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint
    from app.models.team import Team


class CheckpointArrival(Base):
    __tablename__ = "checkpoint_arrivals"
    __table_args__: Any = (
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
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    team: Mapped["Team"] = relationship("Team")
    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint")
