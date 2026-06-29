"""Admin-controlled badge catalogue.

Each row represents one badge type that can exist in the system. The ``code``
field maps 1-to-1 with legacy ``BadgeType`` enum values, ensuring existing
``TeamBadge`` rows remain valid. New badges can be added by inserting here.
"""
from typing import Optional
from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.core.config import settings


class BadgeDefinition(Base):
    __tablename__ = "badge_definitions"  # type: ignore[assignment]
    __table_args__ = {"schema": settings.SCHEMA_NAME}

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
