"""Giving up on a checkpoint.

The escape hatch for a team that cannot solve a riddle. The hint ladder ends;
without this the post stays theirs for the rest of the event and their game is
over an hour early. Giving up costs points and forfeits the post's score, but
the route continues.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud import crud_activity
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward
from app.schemas.skip import CheckpointSkipped
from app.services.checkin_service import require_same_event
from app.services.route_progress import can_reach_checkpoint, current_checkpoint_order
from app.services.scoring_service import ScoringService

ALREADY_SKIPPED = "This checkpoint was already given up on"
SKIP_DISABLED = "Giving up on a checkpoint is not enabled for this event"
NOT_CURRENT_CHECKPOINT = "You can only give up on the checkpoint you are heading to"


class SkipService:
    """Forfeit the current checkpoint and move the team on."""

    def __init__(self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam):
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def skipped_checkpoint_ids(self, team_id: int) -> set[int]:
        stmt = select(CheckpointSkip.checkpoint_id).where(CheckpointSkip.team_id == team_id)
        return set((await self._db.scalars(stmt)).all())

    async def skip(self, *, team_id: int, checkpoint_id: int) -> CheckpointSkipped:
        """Give up on the team's current checkpoint, charge them, and advance."""
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint is None:
            raise RallyNotFoundError("Checkpoint not found")
        team = await self._team_crud.get(db=self._db, id=team_id)
        if team is None:
            raise RallyNotFoundError("Team not found")

        # Cross-edition guard, same rule every progress path applies.
        require_same_event(team.event_id, checkpoint.event_id)

        settings = await rally_settings.get_or_create(self._db)
        if not getattr(settings, "skip_enabled", True):
            raise RallyValidationError(SKIP_DISABLED)
        # Hours are not enforced here: giving up on a bar that has not opened
        # yet is exactly what a stuck team wants to do.
        if not await can_reach_checkpoint(
            self._db,
            team=team,
            checkpoint=checkpoint,
            settings=settings,
            enforce_hours=False,
            ignore_times_inflation=True,
        ):
            # Giving up on a post they have not reached would let a team skim
            # the route, paying to fast-forward to the end.
            raise RallyValidationError(NOT_CURRENT_CHECKPOINT)

        cost = int(settings.skip_penalty or 0)
        skip = CheckpointSkip(team_id=team_id, checkpoint_id=checkpoint_id, cost=cost)
        try:
            # Savepoint so a losing race undoes only this insert.
            async with self._db.begin_nested():
                self._db.add(skip)
        except IntegrityError:
            raise RallyValidationError(ALREADY_SKIPPED) from None

        if cost != 0:
            await self._charge(team_id=team_id, cost=cost, checkpoint_order=checkpoint.order)
        await self._db.commit()

        # Advancing is the whole point: append to team.times so the team's
        # current pointer moves to the next post. compute_checkpoint_progress
        # treats a skipped post as resolved, so a post with an unjudged
        # activity no longer blocks the route.
        await checkin_team_to_checkpoint(self._db, team_id, checkpoint_id, enforce_order=False)

        if cost != 0:
            await ScoringService(self._db).update_team_scores(team_id)

        team_obj = await self._team_crud.get(db=self._db, id=team_id)
        next_order = await current_checkpoint_order(self._db, team_obj) if team_obj else None
        return CheckpointSkipped(
            checkpoint_id=checkpoint_id,
            cost=cost,
            next_checkpoint_order=next_order,
        )

    async def _charge(self, *, team_id: int, cost: int, checkpoint_order: int) -> None:
        """Bill the forfeit as a DynamicAward, for the same reason hints are:
        team.total is recomputed from activity results plus active awards, so a
        direct decrement would be erased by the next recompute."""
        event = await crud_activity.rally_event.get_current(self._db)
        self._db.add(
            DynamicAward(
                team_id=team_id,
                event_id=event.id if event else None,
                points=float(cost),
                reason=f"Desistiu do posto {checkpoint_order}"[:256],
                is_active=True,
            )
        )
