from typing import Any

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base


class RallyGuideAssignment(Base):
    """
    Links NEI users (guides) to a Rally team.
    Unlike staff (fixed to one checkpoint/posto, guiding whichever team
    passes through), a guide is assigned to a single team and accompanies it
    through the whole route — the checkpoint they may currently act on is
    derived from that team's progress (see GuideService), not stored here.
    The row does not grant the guide role (that comes from the authentik
    group), it only records which team a guide is assigned to.
    """

    # One assignment row per (guide, team) — a returning guide gets a fresh
    # assignment for the current edition instead of their old-edition row being
    # repointed. The CRUD lookups join ``team`` and filter the current event
    # (mirrors rally_staff_assignment; see migration 0054).
    __table_args__: Any = (
        UniqueConstraint("user_id", "team_id", name="uq_guide_assignment_user_team"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Reference to NEI user (by ID, not foreign key to avoid coupling)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Reference to Rally team
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"), nullable=True
    )

    # Relationship to team
    team = relationship("Team", back_populates="guide_assignments")
