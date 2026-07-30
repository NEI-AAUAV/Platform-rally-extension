"""Business rules for checkpoints: visibility, teams-at-checkpoint listing,
and cascading delete. Moved out of app.api.api_v1.checkpoint, which used to
hold this logic inline in the router handlers.
"""

from collections.abc import Sequence
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.team import Team
from app.models.user import User
from app.schemas.checkpoint import DetailedCheckPoint
from app.schemas.team import ListingTeam
from app.services.team_service import TeamService


class CheckpointService:
    """Checkpoint visibility rules, team roster lookups, and lifecycle."""

    def __init__(
        self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    @staticmethod
    def _validate_list(items: Sequence[Any]) -> list[DetailedCheckPoint]:
        adapter = TypeAdapter(list[DetailedCheckPoint])
        return adapter.validate_python(items)

    async def all_checkpoints(self) -> list[DetailedCheckPoint]:
        """Every checkpoint in the current event, ordered — the admin/staff view."""
        return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))

    async def visible_checkpoints_for_team(
        self, team_id: int, settings: Any
    ) -> list[DetailedCheckPoint]:
        """Return visible checkpoints for a team member."""
        if settings.show_route_mode == "complete":
            return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))

        all_checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db)
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice
        # (a stale team_id 404s before reaching here); kept as a defensive guard.
        team = await self._team_crud.get(db=self._db, id=team_id)
        if not team:
            return []

        _, current_order, _ = await TeamService(
            self._db, self._team_crud
        ).compute_checkpoint_progress(team)
        return self._validate_list([cp for cp in all_checkpoints if cp.order <= current_order])

    async def visible_checkpoints_for_public(
        self, settings: Any
    ) -> list[DetailedCheckPoint] | None:
        """Return visible checkpoints for unauthenticated / public access.

        Returns *None* when access should be denied.
        """
        if not (settings.public_access_enabled and settings.show_checkpoint_map):
            if settings.show_checkpoint_map:
                return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))
            return None
        if settings.show_route_mode == "focused":
            all_checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db)
            if not all_checkpoints:
                return []
            return self._validate_list([all_checkpoints[0]])
        return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))

    async def list_teams_at_checkpoint(
        self, *, checkpoint_id: int, is_admin_unfiltered: bool
    ) -> list[ListingTeam]:
        """Teams currently at (or having passed through) a checkpoint.

        ``is_admin_unfiltered`` selects every team regardless of checkpoint
        when an admin passed no ``checkpoint_id`` filter.
        """
        if is_admin_unfiltered:
            teams = (await self._db.scalars(select(Team).options(selectinload(Team.members)))).all()
        else:
            teams = await self._team_crud.get_by_checkpoint(
                db=self._db, checkpoint_id=checkpoint_id
            )

        return [
            ListingTeam(
                id=team.id,
                name=team.name,
                total=team.total,
                classification=team.classification,
                versus_group_id=team.versus_group_id,
                times=team.times,
                last_checkpoint_time=team.last_checkpoint_time,
                last_checkpoint_score=team.last_checkpoint_score,
                num_members=team.num_members,
                last_checkpoint_number=None,
                last_checkpoint_name=None,
                current_checkpoint_number=None,
            )
            for team in teams
        ]

    async def delete_checkpoint(self, checkpoint_id: int) -> None:
        """Delete a checkpoint and everything that references it: staff/guide
        assignments, and staff members' assigned-checkpoint pointer."""
        await self._db.execute(
            delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint_id)
        )
        await self._db.execute(
            delete(RallyGuideAssignment).where(RallyGuideAssignment.checkpoint_id == checkpoint_id)
        )
        await self._db.execute(
            update(User)
            .where(User.staff_checkpoint_id == checkpoint_id)
            .values(staff_checkpoint_id=None)
        )
        await self._checkpoint_crud.remove(db=self._db, id=checkpoint_id, commit=False)
        await self._db.commit()
