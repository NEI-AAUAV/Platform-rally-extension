from typing import Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Integer, Text, String, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.models.base import Base
from app.core.config import settings

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint


class MediaKind(str, enum.Enum):
    photo = "photo"
    fun_fact = "fun_fact"


class CheckpointMedia(Base):
    __tablename__ = "checkpoint_media"  # type: ignore[assignment]
    __table_args__ = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    checkpoint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[MediaKind] = mapped_column(
        SAEnum(MediaKind, name="media_kind", schema=settings.SCHEMA_NAME),
        nullable=False,
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint", back_populates="media")
