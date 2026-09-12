from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base
from app.models.user import User

if TYPE_CHECKING:
    from app.models.activity import ActivityResult
    from app.models.rally_guide_assignment import RallyGuideAssignment


class Team(Base):
    __tablename__ = "teams"
    # Team name is unique within an event, not globally. access_code stays
    # globally unique so team login can resolve a team (and its event) from
    # the code alone.
    __table_args__: Any = (
        UniqueConstraint("event_id", "name", name="uq_team_event_name"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column()
    access_code: Mapped[str] = mapped_column(unique=True, index=True)
    # Incremented whenever a credential that can authenticate this team is
    # rotated or the team is disabled. It revokes all outstanding team JWTs.
    auth_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Official team photo (R2 public URL). Shown on the team page, leaderboard
    # and team cards. Empty string when unset (falls back to a placeholder).
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # Every team belongs to exactly one edition; nothing is shared across
    # events (see migration 0055).
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=False, index=True
    )
    # Staggered start: minutes added to the event's start time for this team
    # only. Every team walks the same route, but spreading the departures stops
    # them all standing at the same post copying each other's answer. 0 (the
    # default) means the team starts with everyone else, exactly as before.
    start_offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    total: Mapped[int] = mapped_column(default=0)
    # 0 == unranked (no classification computed yet). Never negative: the
    # frontend cannot tell a sentinel from a real rank, so an unranked team
    # must sort last, not first.
    classification: Mapped[int] = mapped_column(default=0)
    # When this team's total last changed. Tie-break for equal totals: the
    # team that reached the score first ranks ahead. NULL for teams that have
    # never scored.
    last_scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list[User]] = relationship()
    versus_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Activity relationships
    activity_results: Mapped[list["ActivityResult"]] = relationship(
        "ActivityResult", back_populates="team"
    )

    # Per-post progress is not stored here: it lives in the identity-keyed
    # checkpoint_arrivals / checkpoint_skips / activity_results rows (see
    # app.services.team_checkpoint_progress and migration 0063).

    guide_assignments: Mapped[list["RallyGuideAssignment"]] = relationship(
        "RallyGuideAssignment", back_populates="team"
    )

    @property
    def num_members(self) -> int:
        """Requires ``members`` to be eager-loaded (e.g. via selectinload)."""
        return len(self.members)
