from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.team import Team
from app.schemas.rally_guide_assignment import (
    RallyGuideAssignmentCreate,
    RallyGuideAssignmentUpdate,
)


class CRUDRallyGuideAssignment(
    CRUDBase[RallyGuideAssignment, RallyGuideAssignmentCreate, RallyGuideAssignmentUpdate]
):
    async def get_by_user_id(self, db: AsyncSession, user_id: int) -> RallyGuideAssignment | None:
        """This user's guide assignment **in the current event**.

        A guide can work more than one edition. Selecting on ``user_id`` alone
        returned whichever row came back first — so a returning guide's stale
        cross-edition assignment leaked to the lookup, and ``create_or_update``
        then repointed that finished edition's row instead of creating one for
        the current event. ``get_multi_with_team`` was already scoped this way;
        this is the same join.
        """
        event_id = await current_event_id(db)
        stmt = (
            select(RallyGuideAssignment)
            .join(Team, RallyGuideAssignment.team_id == Team.id)
            .where(
                RallyGuideAssignment.user_id == user_id,
                (Team.event_id == event_id) | (Team.event_id.is_(None)),
            )
        )
        result: RallyGuideAssignment | None = await db.scalar(stmt)
        return result

    async def get_by_team_id(
        self, db: AsyncSession, team_id: int
    ) -> Sequence[RallyGuideAssignment]:
        """Get all guide assignments for a specific team"""
        stmt = select(RallyGuideAssignment).where(RallyGuideAssignment.team_id == team_id)
        return (await db.scalars(stmt)).all()

    async def get_multi_with_team(self, db: AsyncSession) -> Sequence[RallyGuideAssignment]:
        """Get guide assignments scoped to the current event's teams.

        Assignments pointing at a team from a different event (or with no
        team) are excluded, so switching events doesn't leak another event's
        guide-to-team assignments.
        """
        event_id = await current_event_id(db)
        stmt = (
            select(RallyGuideAssignment)
            .join(Team, RallyGuideAssignment.team_id == Team.id)
            .where((Team.event_id == event_id) | (Team.event_id.is_(None)))
            .options(selectinload(RallyGuideAssignment.team))
        )
        return (await db.scalars(stmt)).all()

    async def create_or_update(
        self, db: AsyncSession, *, user_id: int, team_id: int | None = None
    ) -> RallyGuideAssignment | None:
        """Create or update guide assignment for a user"""
        existing = await self.get_by_user_id(db, user_id)

        if existing:
            if team_id is None:
                await db.delete(existing)
                await db.commit()
                return None
            existing.team_id = team_id
            await db.commit()
            await db.refresh(existing, ["team"])
            return existing
        if team_id is not None:
            assignment = RallyGuideAssignment(user_id=user_id, team_id=team_id)
            db.add(assignment)
            await db.commit()
            await db.refresh(assignment, ["team"])
            return assignment
        return None


rally_guide_assignment = CRUDRallyGuideAssignment(RallyGuideAssignment)
