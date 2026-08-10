import enum
from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint


class MediaKind(str, enum.Enum):
    photo = "photo"
    fun_fact = "fun_fact"
    # Rich clue media: QR code, a Spotify embed, or a plain external link.
    # TODO: a `document`/PDF kind would need image_upload.py extended with
    # an ALLOWED_DOCUMENT_CONTENT_TYPES set + a `document_url` column — no
    # confirmed use case for it yet, so left out of this pass.
    qr = "qr"
    spotify = "spotify"
    link = "link"


class CheckpointMedia(Base):
    __tablename__ = "checkpoint_media"
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

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
    # `photo` only — an R2-uploaded asset, deleted from storage on replace/delete.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # `spotify`/`link` only — an external URL, never touches R2 storage.
    content_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # `qr` only — the raw payload (URL or free text) the QR code encodes.
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # `spotify`/`link` only — short optional label shown above the embed/card.
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    checkpoint: Mapped["CheckPoint"] = relationship("CheckPoint", back_populates="media")
