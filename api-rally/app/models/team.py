from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList
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
    # Official team photo (R2 public URL). Shown on the team page, leaderboard
    # and team cards. Empty string when unset (falls back to a placeholder).
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # Event scoping: nullable so existing single-event rows remain valid.
    event_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id"), nullable=True, index=True
    )
    # Staggered start: minutes added to the event's start time for this team
    # only. Every team walks the same route, but spreading the departures stops
    # them all standing at the same post copying each other's answer. 0 (the
    # default) means the team starts with everyone else, exactly as before.
    start_offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # All arrays are wrapped in MutableList so in-place .append() (e.g. in
    # crud_team.add_checkpoint) marks the column dirty; plain ARRAY columns
    # silently lose in-place mutations.
    times: Mapped[list[datetime]] = mapped_column(
        MutableList.as_mutable(ARRAY(DateTime(timezone=False))), default=list
    )

    score_per_checkpoint: Mapped[list[int]] = mapped_column(
        MutableList.as_mutable(ARRAY(Integer)), default=list
    )

    # Additional arrays needed for Rally functionality
    question_scores: Mapped[list[bool]] = mapped_column(
        MutableList.as_mutable(ARRAY(Boolean)), default=list
    )
    time_scores: Mapped[list[int]] = mapped_column(
        MutableList.as_mutable(ARRAY(Integer)), default=list
    )
    pukes: Mapped[list[int]] = mapped_column(MutableList.as_mutable(ARRAY(Integer)), default=list)
    skips: Mapped[list[int]] = mapped_column(MutableList.as_mutable(ARRAY(Integer)), default=list)

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

    guide_assignments: Mapped[list["RallyGuideAssignment"]] = relationship(
        "RallyGuideAssignment", back_populates="team"
    )

    @property
    def num_members(self) -> int:
        """Requires ``members`` to be eager-loaded (e.g. via selectinload)."""
        return len(self.members)

    @property
    def last_checkpoint_time(self) -> datetime | None:
        return self.times[-1] if self.times else None

    @property
    def last_checkpoint_score(self) -> int | None:
        """The score of the furthest post on the route this team has scored at.

        ``score_per_checkpoint`` has one slot per post, in route order, so the
        last *non-zero* slot is the last post that actually scored. Reading
        ``[-1]`` blindly reports the final post of the route, which for a team
        mid-route is always 0.
        """
        for score in reversed(self.score_per_checkpoint or []):
            if score != 0:
                return score
        return 0 if self.score_per_checkpoint else None

    def record_checkpoint(
        self, *, question_score: bool, time_score: int, pukes: int, skips: int, at: datetime
    ) -> None:
        """Append this checkpoint's results.

        Arrays are wrapped in ``MutableList`` (see above) so these in-place
        appends mark the column dirty. The only writer of these arrays —
        callers must not append to them directly.
        """
        self.question_scores.append(question_score)
        self.time_scores.append(time_score)
        self.pukes.append(pukes)
        self.skips.append(skips)
        self.times.append(at)
