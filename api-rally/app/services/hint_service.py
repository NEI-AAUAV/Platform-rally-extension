"""Hint economy for peddy paper: a team stuck on a riddle unlocks the guide
indications one at a time, paying points for each.

Reuses ``CheckpointGuideIndication`` as the hint ladder (it already has an
``order``), and never returns its ``question``/``expected_answer`` — those stay
guide-only. Nothing here reveals the checkpoint's name or coordinates: the hint
is help toward the answer, not the answer.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud import crud_activity
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.dynamic_scoring import DynamicAward
from app.schemas.hint import HintReveal, RevealedHint, TeamHints, TeamHintSummary
from app.services.checkin_service import require_same_event
from app.services.route_progress import can_reach_checkpoint
from app.services.scoring_service import ScoringService

HINTS_DISABLED = "Hints are not enabled for this event"
NO_HINTS_LEFT = "No hints left for this checkpoint"
NOT_CURRENT_CHECKPOINT = "Hints are only available for the checkpoint you are heading to"


class HintService:
    """Progressive hint reveals, priced by the ``hint_penalty`` setting."""

    def __init__(self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam):
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def _indications(self, checkpoint_id: int) -> list[CheckpointGuideIndication]:
        stmt = (
            select(CheckpointGuideIndication)
            .where(CheckpointGuideIndication.checkpoint_id == checkpoint_id)
            .order_by(CheckpointGuideIndication.order, CheckpointGuideIndication.id)
        )
        return list((await self._db.scalars(stmt)).all())

    async def _reveals(self, team_id: int, checkpoint_id: int) -> list[CheckpointHintReveal]:
        stmt = (
            select(CheckpointHintReveal)
            .where(
                CheckpointHintReveal.team_id == team_id,
                CheckpointHintReveal.checkpoint_id == checkpoint_id,
            )
            .order_by(CheckpointHintReveal.revealed_at, CheckpointHintReveal.id)
        )
        return list((await self._db.scalars(stmt)).all())

    async def summary_for_team(self, *, team_id: int) -> TeamHintSummary:
        """Every hint this team has bought so far, newest last, plus the total
        it cost them."""
        stmt = (
            select(CheckpointHintReveal, CheckpointGuideIndication)
            .join(
                CheckpointGuideIndication,
                CheckpointGuideIndication.id == CheckpointHintReveal.indication_id,
            )
            .where(CheckpointHintReveal.team_id == team_id)
            .order_by(CheckpointHintReveal.revealed_at, CheckpointHintReveal.id)
        )
        rows = (await self._db.execute(stmt)).all()
        revealed = [
            RevealedHint(
                indication_id=reveal.indication_id,
                hint=indication.hint,
                cost=reveal.cost,
                revealed_at=reveal.revealed_at,
            )
            for reveal, indication in rows
        ]
        return TeamHintSummary(revealed=revealed, total_spent=sum(item.cost for item in revealed))

    async def _require_current_checkpoint(self, team_id: int, checkpoint_id: int) -> None:
        """A team may only buy hints for the post it is currently hunting.

        Without this, a team could drain the hint ladder of every post in the
        route at once and pre-solve the whole game.
        """
        # CRUDBase.get() raises RallyNotFoundError for a missing id, so the
        # None branches below are defensive rather than reachable.
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint is None:
            raise RallyNotFoundError("Checkpoint not found")
        team = await self._team_crud.get(db=self._db, id=team_id)
        if team is None:
            raise RallyNotFoundError("Team not found")

        # Cross-edition guard, same rule the check-in paths apply.
        require_same_event(team.event_id, checkpoint.event_id)

        settings = await rally_settings.get_or_create(self._db)
        # Under a free-choice stage several posts are reachable at once, and
        # hints for any of them are fair: the team really is choosing between
        # them. Opening hours do not apply — the riddle is theirs to solve
        # before the door opens.
        reachable = await can_reach_checkpoint(
            self._db,
            team=team,
            checkpoint=checkpoint,
            settings=settings,
            enforce_hours=False,
            ignore_times_inflation=True,
        )
        if not reachable:
            raise RallyValidationError(NOT_CURRENT_CHECKPOINT)

    async def list_hints(self, *, team_id: int, checkpoint_id: int) -> TeamHints:
        """The hints this team has already paid for, plus how many remain.

        Deliberately does *not* enforce "current checkpoint": a team must still
        be able to re-read a hint it bought for a post it has since completed.
        """
        indications = await self._indications(checkpoint_id)
        reveals = await self._reveals(team_id, checkpoint_id)
        by_id = {indication.id: indication for indication in indications}
        revealed = [
            RevealedHint(
                indication_id=reveal.indication_id,
                hint=by_id[reveal.indication_id].hint,
                cost=reveal.cost,
                revealed_at=reveal.revealed_at,
            )
            for reveal in reveals
            if reveal.indication_id in by_id
        ]
        settings = await rally_settings.get_or_create(self._db)
        # With the mechanic off, hints already bought stay readable — the team
        # paid for them — but nothing is left to buy.
        enabled = bool(getattr(settings, "hints_enabled", True))
        return TeamHints(
            checkpoint_id=checkpoint_id,
            revealed=revealed,
            remaining=(len(indications) - len(revealed)) if enabled else 0,
            next_cost=int(settings.hint_penalty or 0),
        )

    async def reveal_next(self, *, team_id: int, checkpoint_id: int) -> HintReveal:
        """Unlock the next hint in the ladder and charge the team for it."""
        settings = await rally_settings.get_or_create(self._db)
        if not getattr(settings, "hints_enabled", True):
            raise RallyValidationError(HINTS_DISABLED)
        await self._require_current_checkpoint(team_id, checkpoint_id)

        indications = await self._indications(checkpoint_id)
        if not indications:
            raise RallyValidationError(NO_HINTS_LEFT)

        already_revealed = {r.indication_id for r in await self._reveals(team_id, checkpoint_id)}
        remaining = [i for i in indications if i.id not in already_revealed]
        if not remaining:
            raise RallyValidationError(NO_HINTS_LEFT)

        indication = remaining[0]
        settings = await rally_settings.get_or_create(self._db)
        cost = int(settings.hint_penalty or 0)

        reveal = CheckpointHintReveal(
            team_id=team_id,
            checkpoint_id=checkpoint_id,
            indication_id=indication.id,
            cost=cost,
        )
        try:
            # Savepoint, not a bare flush: on a losing race only this insert
            # is undone. A plain rollback here would discard the whole request
            # transaction, which is the same reason add_checkpoint uses one.
            async with self._db.begin_nested():
                self._db.add(reveal)
        except IntegrityError:
            # Two taps raced: the unique constraint won, so this hint is
            # already paid for. Hand it back for free rather than 500-ing.
            return await self._hint_already_owned(team_id, checkpoint_id, indication)

        if cost != 0:
            await self._charge(team_id=team_id, cost=cost, indication=indication)

        await self._db.commit()
        if cost != 0:
            # Fold the award into team.total (which ScoringService recomputes
            # from scratch — hence the award row rather than a direct += ).
            await ScoringService(self._db).update_team_scores(team_id)

        return HintReveal(
            checkpoint_id=checkpoint_id,
            indication_id=indication.id,
            hint=indication.hint,
            cost=cost,
            remaining=len(remaining) - 1,
        )

    async def _hint_already_owned(
        self, team_id: int, checkpoint_id: int, indication: CheckpointGuideIndication
    ) -> HintReveal:
        indications = await self._indications(checkpoint_id)
        revealed = {r.indication_id for r in await self._reveals(team_id, checkpoint_id)}
        return HintReveal(
            checkpoint_id=checkpoint_id,
            indication_id=indication.id,
            hint=indication.hint,
            cost=0,
            remaining=len([i for i in indications if i.id not in revealed]),
        )

    async def _charge(
        self, *, team_id: int, cost: int, indication: CheckpointGuideIndication
    ) -> None:
        """Bill the hint as a DynamicAward.

        team.total is recomputed from activity results plus active awards, so a
        direct decrement would be erased by the next recompute. An award row is
        also visible to admins and revocable if a hint turns out to be broken.
        """
        event = await crud_activity.rally_event.get_current(self._db)
        self._db.add(
            DynamicAward(
                team_id=team_id,
                event_id=event.id if event else None,
                points=float(cost),
                reason=f"Pista revelada (indicação #{indication.order + 1})"[:256],
                is_active=True,
            )
        )
