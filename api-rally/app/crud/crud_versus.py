from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyValidationError,
)
from app.crud._event_scope import current_event_id
from app.crud.crud_rally_settings import rally_settings
from app.db.locks import lock_team_ranking
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

        # Take the edition's team-write gate before reading versus_group_id, so
        # two concurrent pair requests sharing a team can't both observe it as
        # unpaired and cross-pair it. The gate, not a row lock: a FOR UPDATE
        # here would conflict with the KEY SHARE an arrival INSERT holds on the
        # same team row, and deadlock against it (see app.db.locks).
        locked_ids = sorted((team_a_id, team_b_id))
        await lock_team_ranking(db, await current_event_id(db))
        # autoflush is off, so flush before a populate_existing re-read: the
        # re-read overwrites the session's copies, and unflushed changes to
        # these rows would be lost with it.
        await db.flush()
        result = await db.execute(
            select(Team)
            .where(Team.id.in_(locked_ids))
            .order_by(Team.id)
            # Re-read under the gate rather than reusing a copy this session
            # may already hold, which is what the dropped FOR UPDATE also did.
            .execution_options(populate_existing=True)
        )
        teams_by_id = {t.id: t for t in result.scalars().all()}
        team_a = teams_by_id.get(team_a_id)
        team_b = teams_by_id.get(team_b_id)

        if not team_a or not team_b:
            raise RallyNotFoundError("One or both teams not found")

        event_id = await current_event_id(db)
        # A versus group is meaningful only within the current edition.  Do
        # not let an ID from an archived event create a cross-edition match.
        if team_a.event_id not in (None, event_id) or team_b.event_id not in (None, event_id):
            raise RallyNotFoundError("One or both teams not found")
        if team_a.event_id != team_b.event_id:
            raise RallyValidationError("Teams must belong to the same event")

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
        event_id = await current_event_id(db)
        team = await db.get(Team, team_id)
        if not team or team.versus_group_id is None or team.event_id not in (None, event_id):
            return None

        result = await db.execute(
            select(Team)
            .where(Team.id != team_id)
            .where(Team.versus_group_id == team.versus_group_id)
            # Pairing already rejects cross-event groups, so matching this team's
            # event_id is enough. SQLAlchemy emits ``IS NULL`` when it is None.
            .where(Team.event_id == team.event_id)
        )
        return result.scalar_one_or_none()

    async def get_all_versus_pairs(self, db: AsyncSession) -> list[dict[str, Any]]:
        event_id = await current_event_id(db)
        teams = (
            await db.scalars(
                select(Team).where(
                    Team.versus_group_id.isnot(None),
                    (Team.event_id == event_id) | (Team.event_id.is_(None)),
                )
            )
        ).all()

        groups = defaultdict(list)
        for team in teams:
            groups[team.versus_group_id].append(team.id)

        return [
            {"group_id": gid, "team_ids": tids} for gid, tids in groups.items() if len(tids) == 2
        ]

    async def remove_versus_pair(self, db: AsyncSession, *, group_id: int) -> list[int]:
        """Atomically dissolve one complete pair in the current edition."""
        event_id = await current_event_id(db)
        await lock_team_ranking(db, event_id)
        await db.flush()  # see create_versus_pair: flush before re-reading
        teams = list(
            (
                await db.scalars(
                    select(Team)
                    .where(
                        Team.versus_group_id == group_id,
                        (Team.event_id == event_id) | (Team.event_id.is_(None)),
                    )
                    .order_by(Team.id)
                    .execution_options(populate_existing=True)
                )
            ).all()
        )
        if len(teams) != 2:
            raise RallyNotFoundError("Versus group not found")
        for team in teams:
            team.versus_group_id = None
        await db.commit()
        return [team.id for team in teams]


versus = CRUDVersus()
