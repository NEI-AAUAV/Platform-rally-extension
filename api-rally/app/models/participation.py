"""Per-person participation history across event editions.

Rally has two identity systems: OIDC logins (mirrored into ``user`` by
``authentik_sub``) and name-only team members (``user`` rows with a NULL
``authentik_sub``). A person's *profile* is anchored on their OIDC identity, so
participation is keyed by ``authentik_sub`` — that way history survives even if
the team row is later deleted when an edition is archived.

A row is created when an OIDC user is linked to a team in an event (directly, or
by "claiming" a name-only member). ``team_total``/``team_classification`` are
snapshots taken at claim time; live values are preferred at read time while the
team still exists.
"""
from datetime import datetime, timezone
from typing import Any, ClassVar, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class EventParticipation(Base):
    """One person's participation in one event edition."""

    __tablename__ = "event_participation"  # type: ignore[assignment]
    __table_args__: ClassVar[tuple[Any, ...]] = (
        # One participation per person per event.
        UniqueConstraint("authentik_sub", "event_id", name="uq_participation_person_event"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # OIDC subject of the person (the stable cross-edition identity).
    authentik_sub: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    event_id: Mapped[int] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), index=True, nullable=False
    )
    # The team they played in. Nullable + SET NULL so archiving/deleting a team
    # keeps the historical participation row.
    team_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Display snapshot of the team at claim time (kept for archived editions).
    team_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    team_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    team_classification: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_captain: Mapped[bool] = mapped_column(Boolean, default=False)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
