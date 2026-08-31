from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint


class CheckpointGuideIndication(Base):
    """Structured indications a guide gives the team at a checkpoint.

    Unlike ``CheckpointMedia`` (photos / free-text fun facts), these are
    structured guidance rows: a hint the guide should convey, and optionally a
    question to ask the team plus the expected answer.
    """

    __tablename__ = "checkpoint_guide_indication"
    # ``order`` is the hint ladder's rung, and ``HintService`` buys "the next
    # one" by it — two rows sharing an order at the same post make which hint
    # a team paid for ambiguous.
    __table_args__: Any = (
        UniqueConstraint("checkpoint_id", "order", name="uq_guide_indication_checkpoint_order"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    checkpoint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hint: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    checkpoint: Mapped["CheckPoint"] = relationship(
        "CheckPoint", back_populates="guide_indications"
    )
