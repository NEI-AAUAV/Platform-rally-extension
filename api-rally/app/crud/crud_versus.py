from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyValidationError,
)
from app.crud.crud_rally_settings import rally_settings
from app.models.team import Team


class CRUDVersus:
    async def create_versus_pair(self, db: AsyncSession, *, team_a_id: int, team_b_id: int) -> int:
        """
        Manually pair two teams into a versus group.

        Returns:
            The group ID (same as team_a_id for simplicity)
        """

        settings = await rally_settings.get_or_create(db)
        if not settings.enable_versus:
            raise RallyForbiddenError("Versus mode is not enabled")

        if team_a_id == team_b_id:
            raise RallyValidationError("A team cannot be paired with itself")

        # Lock both team rows before checking versus_group_id so two
        # concurrent pair requests sharing a team can't both observe it as
        # unpaired and cross-pair it. Locked in id order to avoid deadlocking
        # against another pair request that targets the same two teams in
        # reverse.
        locked_ids = sorted((team_a_id, team_b_id))
        result = await db.execute(
            select(Team).where(Team.id.in_(locked_ids)).order_by(Team.id).with_for_update()
        )
        teams_by_id = {t.id: t for t in result.scalars().all()}
        team_a = teams_by_id.get(team_a_id)
        team_b = teams_by_id.get(team_b_id)

        if not team_a or not team_b:
            raise RallyNotFoundError("One or both teams not found")

        if team_a.versus_group_id is not None:
            raise RallyValidationError(f"Team {team_a_id} is already in a versus group")

        if team_b.versus_group_id is not None:
            raise RallyValidationError(f"Team {team_b_id} is already in a versus group")

        # use team_a.id as the group id (no extra table)
        group_id = team_a.id
        team_a.versus_group_id = group_id
        team_b.versus_group_id = group_id

        await db.commit()
        return group_id

    async def get_opponent(self, db: AsyncSession, *, team_id: int) -> Team | None:
        """Get the opponent team in the same versus group"""
        team = await db.get(Team, team_id)
        if not team or team.versus_group_id is None:
            return None

        result = await db.execute(
            select(Team)
            .where(Team.id != team_id)
            .where(Team.versus_group_id == team.versus_group_id)
        )
        return result.scalar_one_or_none()

    async def get_all_versus_pairs(self, db: AsyncSession) -> list[dict[str, Any]]:
        teams = (await db.scalars(select(Team).where(Team.versus_group_id.isnot(None)))).all()

        groups = defaultdict(list)
        for team in teams:
            groups[team.versus_group_id].append(team.id)

        return [
            {"group_id": gid, "team_ids": tids} for gid, tids in groups.items() if len(tids) == 2
        ]


versus = CRUDVersus()
