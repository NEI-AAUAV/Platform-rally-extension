"""Admin-controlled badge catalogue.

Each row represents one badge type that can exist in the system. The ``code``
field maps 1-to-1 with legacy ``BadgeType`` enum values, ensuring existing
``TeamBadge`` rows remain valid. New badges can be added by inserting here.
"""

from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base

# Default badge colour when the admin has not picked one (matches the frontend
# FALLBACK). Kept here so the model, migration and API share one source.
DEFAULT_BADGE_COLOR = "#8b5cf6"


class BadgeDefinition(Base):
    __tablename__ = "badge_definitions"
    __table_args__: Any = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    # NULL = global/seeded badge visible in every event. Admin-created badges
    # are stamped with the current event so per-edition catalogues stay apart.
    event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"),
        nullable=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Display: hex colour (incl. optional alpha) + a single emoji/glyph. The
    # showcase renders these when there is no icon image.
    color: Mapped[str] = mapped_column(
        String(9), nullable=False, server_default=DEFAULT_BADGE_COLOR
    )
    glyph: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # Auto-award behaviour. ``trigger_type`` is a BadgeTrigger value (NULL =
    # manual-only); ``criteria`` holds its params (e.g. {"activity_id": 12}).
    trigger_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    criteria: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
