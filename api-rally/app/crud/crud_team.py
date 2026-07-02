import math
from typing import List, Sequence, Any
from datetime import datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from loguru import logger
import secrets
import string

from sqlalchemy.ext.asyncio import AsyncSession

from app.exception import APIException
from app.core.exceptions import RallyValidationError
from app.crud.base import CRUDBase
from app.models.team import Team
from app.schemas.team import (
    TeamCreate,
    TeamUpdate,
    TeamScoresUpdate,
)

from app.crud.crud_rally_settings import rally_settings
from app.crud._event_scope import current_event_id

locked_arrays = [
    "times",
    "question_scores",
    "time_scores",
    "pukes",
    "skips",
]

import re

# Matches the composite (event_id, name) unique constraint by its Postgres
# constraint name, not column list — asyncpg reports "Key (event_id, name)=(...)
# already exists" for composite constraints, which unique_key_error_regex's
# single-column pattern does not match.
_name_unique_error_regex = re.compile(r"uq_team_event_name")


async def _generate_access_code(db: AsyncSession) -> str:
    """Generate a unique, human-readable 8-character code (XXXX-XXXX) for a team."""
    while True:
        part1 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        part2 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        code = f"{part1}-{part2}"

        # Check for uniqueness in the database
        existing = await db.scalar(select(Team).where(Team.access_code == code))
        if existing is None:
            return code


class CRUDTeam(CRUDBase[Team, TeamCreate, TeamUpdate]):
    def calculate_min_time_scores(self, teams: Sequence[Team]) -> List[float]:
        all_time_scores = [
            t.time_scores + [0] * (8 - len(t.time_scores)) for t in teams
        ]

        min_time_scores = [
            min((s if s != 0 else math.inf) for s in scores)
            for scores in zip(*all_time_scores)
        ]

        return min_time_scores

    def calculate_checkpoint_score(
        self, checkpoint: int, *, team: Team, min_time_scores: List[float], penalty_per_puke: int = -20
    ) -> int:
        def calc_time_score(checkpoint: int, score: int) -> int:
            return int(min_time_scores[checkpoint] / score * 10) if score != 0 else 0

        def calc_question_scores(is_correct: bool) -> int:
            return int(is_correct) * 8

        def calc_pukes(pukes: int) -> int:
            return pukes * penalty_per_puke

        def calc_skips(skips: int) -> int:
            if skips > 0:
                return skips * -8
            return abs(skips) * 4

        return (
            calc_time_score(checkpoint, team.time_scores[checkpoint] if checkpoint < len(team.time_scores) else 0)
            + calc_question_scores(
                team.question_scores[checkpoint] if checkpoint < len(team.question_scores) else False
            )
            + calc_skips(team.skips[checkpoint] if checkpoint < len(team.skips) else 0)
            + calc_pukes(team.pukes[checkpoint] if checkpoint < len(team.pukes) else 0)
        )

    async def get_by_access_code(self, db: AsyncSession, *, access_code: str) -> Team | None:
        """Get a team by their access code (access_code is globally unique)."""
        return await db.scalar(select(Team).where(Team.access_code == access_code))

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int | None = None,
        limit: int | None = None,
        for_update: bool = False,
    ) -> Sequence[Team]:
        """List teams scoped to the current event.

        Ranking and listing operate per-edition: only teams whose event_id
        matches the current event are returned. Legacy rows with event_id NULL
        are folded into the current event so single-event data keeps showing.
        """
        event_id = await current_event_id(db)
        stmt = select(Team).where(
            (Team.event_id == event_id) | (Team.event_id.is_(None))
        ).limit(limit).offset(skip)
        if for_update:
            stmt = stmt.with_for_update()
        return list((await db.scalars(stmt)).all())

    async def update_classification_unlocked(self, db: AsyncSession) -> None:
        """Update team classifications based on activity results"""
        from app.services.scoring_service import ScoringService

        teams = list(await self.get_multi(db=db, for_update=True))
        scoring_service = ScoringService(db)

        # Update scores for all teams based on activity results
        # Use nested transaction to avoid breaking row locks
        for team in teams:
            async with db.begin_nested():
                await scoring_service.update_team_scores(team.id, should_commit=False)
            await db.refresh(team)  # Refresh to get updated scores from database

        # Sort teams by total score (descending), then by name (ascending)
        teams.sort(key=lambda t: (-t.total, t.name))

        # Update classifications
        for i, team in enumerate(teams):
            team.classification = i + 1
            db.add(team)

    async def update_classification(self, db: AsyncSession) -> None:
        await self.update_classification_unlocked(db)
        await db.commit()

    async def create(self, db: AsyncSession, *, obj_in: TeamCreate) -> Team:
        settings = await rally_settings.get_or_create(db)
        event_id = await current_event_id(db)
        # Count teams in the current event only, so max_teams is per-edition.
        current_team_count = await db.scalar(
            select(func.count(Team.id)).where(
                (Team.event_id == event_id) | (Team.event_id.is_(None))
            )
        )

        if current_team_count >= settings.max_teams:
            raise RallyValidationError("Team limit reached")

        obj_in_data = obj_in.model_dump()
        obj_in_data["access_code"] = await _generate_access_code(db)
        obj_in_data["event_id"] = event_id

        team = self.model(**obj_in_data)

        try:
            db.add(team)
            await db.commit()
        except IntegrityError as e:
            await db.rollback()

            if e.orig is None:
                raise

            if _name_unique_error_regex.search(str(e.orig)) is not None:
                raise RallyValidationError("Team name already exists")

            raise

        # Only update classification if there are existing teams
        # This prevents errors when creating the first team
        try:
            await self.update_classification(db=db)
        except Exception as e:
            # Log the error but don't fail team creation
            logger.warning(f"Failed to update classification during team creation: {e}")

        await db.refresh(team)
        return team

    async def update(self, db: AsyncSession, *, id: int, obj_in: TeamUpdate) -> Team:
        async with db.begin_nested():
            team = await self.get(db=db, id=id, for_update=True)
            update_data = obj_in.model_dump(exclude_unset=True)

            should_validate_locked = any(key in update_data for key in locked_arrays)

            if should_validate_locked:
                last_size = None
                for key in locked_arrays:
                    value = update_data.get(key, getattr(team, key))
                    if value is None:
                        continue

                    size = len(value)
                    if last_size is not None and last_size != size:
                        raise APIException(
                            status_code=400, detail="Lists must have the same size"
                        )

                    last_size = size

            team = super().update_unlocked(db_obj=team, obj_in=obj_in)
        await db.commit()

        await self.update_classification(db=db)
        await db.refresh(team)
        return team

    async def set_photo_url(self, db: AsyncSession, *, id: int, url: str) -> Team:
        """Persist the team's official photo URL.

        Kept separate from ``update`` so the R2 upload endpoint is the only
        writer of ``photo_url`` (mirrors rally_settings.set_image_url).
        """
        team = await self.get(db=db, id=id)
        team.photo_url = url
        await db.commit()
        await db.refresh(team)
        return team

    def _validate_rally_timing(self, settings: Any, current_time: datetime) -> None:
        """Validate rally timing constraints"""
        if settings.rally_start_time and current_time < settings.rally_start_time:
            raise APIException(
                status_code=400,
                detail=f"Rally has not started yet. Starts at {settings.rally_start_time.isoformat()}"
            )

        if settings.rally_end_time and current_time > settings.rally_end_time:
            raise APIException(
                status_code=400,
                detail=f"Rally has ended. Ended at {settings.rally_end_time.isoformat()}"
            )

    async def _validate_checkpoint_order(self, db: AsyncSession, team: Team, checkpoint_id: int, settings: Any) -> None:
        """Validate checkpoint order constraints"""
        from app.models.checkpoint import CheckPoint

        # Get the checkpoint to find its order
        checkpoint_obj = await db.get(CheckPoint, checkpoint_id)
        if not checkpoint_obj:
            raise APIException(status_code=404, detail="Checkpoint not found")

        checkpoint_order = checkpoint_obj.order

        if settings.checkpoint_order_matters:
            # Team should have visited exactly (order - 1) checkpoints
            if len(team.times) != checkpoint_order - 1:
                raise APIException(
                    status_code=400,
                    detail=f"Checkpoint not in order. Expected checkpoint order {len(team.times) + 1}, got {checkpoint_order}"
                )
        else:
            # If order doesn't matter, just check if checkpoint already visited by order
            if checkpoint_order <= len(team.times):
                raise APIException(
                    status_code=400,
                    detail=f"Checkpoint {checkpoint_order} already visited"
                )

    async def add_checkpoint(
        self, db: AsyncSession, *, id: int, checkpoint_id: int, obj_in: TeamScoresUpdate
    ) -> Team:
        async with db.begin_nested():
            team = await self.get(db=db, id=id, for_update=True)
            settings = await rally_settings.get_or_create(db)
            current_time = datetime.now(timezone.utc)

            # Validate timing and order constraints
            self._validate_rally_timing(settings, current_time)
            await self._validate_checkpoint_order(db, team, checkpoint_id, settings)

            # Add scores and times
            # question_score is an int in the schema (0 or 1), but stored as bool in the model
            # Convert to bool: 0 -> False, any non-zero -> True
            team.question_scores.append(bool(obj_in.question_score))
            team.time_scores.append(obj_in.time_score)
            team.pukes.append(obj_in.pukes)
            team.skips.append(obj_in.skips)
            team.times.append(current_time.replace(tzinfo=None))

        await db.commit()
        await self.update_classification(db=db)
        await db.refresh(team)
        return team

    async def get_by_checkpoint(self, db: AsyncSession, checkpoint_id: int) -> Sequence[Team]:
        """Get teams currently at a specific checkpoint.

        Since team.times is order-based, we need to convert checkpoint_id to order first.
        Teams are "at" a checkpoint if they've completed that many checkpoints.
        """
        from app.models.checkpoint import CheckPoint

        # Get the checkpoint to find its order
        checkpoint_obj = await db.get(CheckPoint, checkpoint_id)
        if not checkpoint_obj:
            return []

        checkpoint_order = checkpoint_obj.order

        # Teams at this checkpoint have visited exactly (order) checkpoints.
        # Eager-load members so callers can read team.members without a lazy load.
        # Scope to the current event so editions never leak into each other
        # (legacy NULL rows count as current, same as list()).
        event_id = await current_event_id(db)
        stmt = (
            select(Team)
            .options(selectinload(Team.members))
            .where(
                func.cardinality(Team.times) == checkpoint_order,
                (Team.event_id == event_id) | (Team.event_id.is_(None)),
            )
        )
        return (await db.scalars(stmt)).all()


team = CRUDTeam(Team)
