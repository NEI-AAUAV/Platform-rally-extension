from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint
    from app.models.checkpoint_guide_indication import CheckpointGuideIndication
    from app.models.team import Team


class CheckpointHintReveal(Base):
    """One guide indication, unlocked by a team in exchange for points.

    The unique constraint on (team_id, indication_id) is what makes the reveal
    idempotent: a team that re-taps the button gets the same hint back and is
    charged once, the same shape as ``CheckpointArrival``.
    """

    __tablename__ = "checkpoint_hint_reveals"
    __table_args__: Any = (
        UniqueConstraint("team_id", "indication_id", name="uq_hint_reveal_team_indication"),
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
    indication_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoint_guide_indication.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revealed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # The penalty as it stood when the hint was bought, stored negative like
    # every other penalty in the app. Frozen here so that changing
    # ``hint_penalty`` mid-event never re-prices hints already taken.
    cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    team: Mapped["Team"] = relationship("Team")
    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint")
    indication: Mapped["CheckpointGuideIndication"] = relationship("CheckpointGuideIndication")
