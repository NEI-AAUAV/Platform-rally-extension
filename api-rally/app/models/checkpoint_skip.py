from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint
    from app.models.team import Team


class CheckpointSkip(Base):
    """A checkpoint a team gave up on, in exchange for points.

    Without this a team that cannot solve a riddle is stuck at that post for
    the rest of the event: the hint ladder runs out and there is nothing else
    to do. Giving up costs points and closes the post as *failed* — the team
    never scores it, but the route continues.
    """

    __tablename__ = "checkpoint_skips"
    __table_args__: Any = (
        UniqueConstraint("team_id", "checkpoint_id", name="uq_skip_team_checkpoint"),
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
    skipped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # The penalty as it stood when the team gave up, stored negative like every
    # other penalty. Frozen here so changing ``skip_penalty`` mid-event never
    # re-prices a decision already taken.
    cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    team: Mapped["Team"] = relationship("Team")
    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint")
