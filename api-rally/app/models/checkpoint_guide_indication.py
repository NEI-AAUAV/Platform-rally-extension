from typing import Any, ClassVar, Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint


class CheckpointGuideIndication(Base):
    """Structured indications a guide gives the team at a checkpoint.

    Unlike ``CheckpointMedia`` (photos / free-text fun facts), these are
    structured guidance rows: a hint the guide should convey, and optionally a
    question to ask the team plus the expected answer.
    """

    __tablename__ = "checkpoint_guide_indication"  # type: ignore[assignment]
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    checkpoint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hint: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    checkpoint: Mapped["CheckPoint"] = relationship(
        "CheckPoint", back_populates="guide_indications"
    )
