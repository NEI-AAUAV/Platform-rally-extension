"""Business rules and orchestration for teams.

Owns the transaction boundary and validation rules that used to live split
across ``app.crud.crud_team`` (data access + business rules + commits) and
``app.api.api_v1.team`` (checkpoint-progress computation inline in the
router). ``CRUDTeam`` keeps thin delegating wrappers for
``add_checkpoint``/``calculate_min_time_scores``/``update_classification`` so
existing callers (routers, other services, tests) keep working while the logic
itself lives here.

Scoring itself is *not* here: ``ScoringService`` owns it end to end. The one
ranking rule that lives in this module is ``assign_ranks`` — the single
ordering policy every surface must agree with.
"""

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_skip import CheckpointSkip
from app.models.team import Team
from app.schemas.team import (
    CheckpointPenalties,
    ListingTeam,
    PrivilegedDetailedTeam,
    TeamScoresUpdate,
)
from app.services.route_progress import (
    TeamProgress,
    closed_message,
    hours_block_reason,
    progress_for_team,
    unreachable_message,
)
from app.services.scoring_service import ScoringService


def validate_rally_timing(
    settings: Any, current_time: datetime, *, start_offset_minutes: int = 0
) -> None:
    """Reject progress recorded outside the event's window.

    Module-level so every path that records progress can apply the same rule —
    staff evaluation, QR check-in and GPS arrival alike.

    ``start_offset_minutes`` staggers a single team's departure (see
    ``Team.start_offset_minutes``). It moves the team's *start* only: the end
    time is the event's hard boundary — usually a venue closing — and is not
    pushed out for late starters.
    """
    start_time = settings.rally_start_time
    if start_time and start_offset_minutes:
        start_time = start_time + timedelta(minutes=start_offset_minutes)

    if start_time and current_time < start_time:
        raise RallyValidationError(f"Rally has not started yet. Starts at {start_time.isoformat()}")

    if settings.rally_end_time and current_time > settings.rally_end_time:
        raise RallyValidationError(
            f"Rally has ended. Ended at {settings.rally_end_time.isoformat()}"
        )


def assign_ranks(teams: list[Team]) -> None:
    """Write ``team.classification`` (1..N, dense) from current totals.

    Pure: sorts the list in place and stamps the rank. No score recompute, no
    DB access. The single ordering policy for the whole system — every surface
    that shows a rank must agree with this.

    Tie-break: higher total first, then earliest ``last_scored_at`` (the team
    that reached that score first ranks ahead), then name for a fully
    deterministic result when even the timestamps match.
    """
    _never = datetime.max.replace(tzinfo=UTC)
    teams.sort(
        key=lambda t: (
            -t.total,
            _tz_aware(t.last_scored_at) or _never,
            t.name,
        )
    )
    for i, team in enumerate(teams, start=1):
        team.classification = i


def _tz_aware(dt: datetime | None) -> datetime | None:
    """Coerce a possibly-naive timestamp to UTC-aware so it compares cleanly
    against other aware timestamps (Postgres can hand back either)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


class TeamService:
    """Team lifecycle, checkpoint progression, and classification rules."""

    def __init__(self, db: AsyncSession, team_crud: CRUDTeam) -> None:
        self._db = db
        self._team_crud = team_crud

    @staticmethod
    def calculate_min_time_scores(teams: Sequence[Team]) -> list[float]:
        """Per-post best time across all teams; 0 means "no score yet".

        The width is the longest ``time_scores`` any team actually has, not a
        hardcoded 8. A route with more than eight posts silently lost every
        one past the eighth, and one with fewer padded the result with
        infinities for posts that do not exist.
        """
        width = max((len(t.time_scores) for t in teams), default=0)
        all_time_scores = [t.time_scores + [0] * (width - len(t.time_scores)) for t in teams]

        return [
            min((s if s != 0 else math.inf) for s in scores)
            for scores in zip(*all_time_scores, strict=True)
        ]

    async def update_classification_unlocked(self) -> None:
        """Recompute every team's total, then re-rank from those totals."""
        teams = list(await self._team_crud.get_multi(db=self._db, for_update=True))
        scoring_service = ScoringService(self._db)

        # Recompute every team's scores in bulk (2 queries total) rather than
        # per-team in a loop (which was 3 queries + a refresh each). Teams are
        # already row-locked via for_update above; the batch mutates them in
        # the same session, so no nested transaction or refresh is needed.
        await scoring_service.update_all_team_scores(teams)

        assign_ranks(teams)
        for team in teams:
            self._db.add(team)

    async def update_classification(self) -> None:
        await self.update_classification_unlocked()
        await self._db.commit()

    async def reassign_ranks_unlocked(self) -> None:
        """Re-rank every team from the totals already persisted — no score
        recompute. Cheap next to ``update_classification_unlocked`` (one locked
        SELECT + an in-memory sort, no per-team result aggregation), so it is
        safe to run on the hot path after any single team's total changes.
        Does not commit: the caller's transaction carries it.
        """
        teams = list(await self._team_crud.get_multi(db=self._db, for_update=True))
        assign_ranks(teams)
        for team in teams:
            self._db.add(team)

    def _validate_rally_timing(
        self, settings: Any, current_time: datetime, *, start_offset_minutes: int = 0
    ) -> None:
        """Validate rally timing constraints."""
        validate_rally_timing(settings, current_time, start_offset_minutes=start_offset_minutes)

    async def _validate_checkpoint_order(
        self, team: Team, checkpoint_id: int, settings: Any
    ) -> None:
        """Reject a check-in at a post the team may not reach right now."""
        checkpoint_obj = await self._db.get(CheckPoint, checkpoint_id)
        if not checkpoint_obj:
            raise RallyNotFoundError("Checkpoint not found")

        # Hours first: "not in order" would be a lie about a post the team is
        # perfectly entitled to visit, just not yet.
        closed = hours_block_reason(checkpoint_obj, settings)
        if closed is not None:
            raise RallyValidationError(closed_message(checkpoint_obj, closed))

        # This post's own arrival row is held out of the calculation: the
        # question here is "may the team check in *here*", and a no-activity
        # post that the caller has just recorded an arrival for would otherwise
        # read as already resolved and refuse the very visit being recorded.
        # Duplicate visits are stopped one layer up, by the arrival row's
        # unique constraint (see ``checkpoint_visits.record_visit``).
        progress = await progress_for_team(
            self._db, team, settings, ignore_arrival_for=checkpoint_obj.id
        )
        if progress.is_open(checkpoint_obj.order):
            return
        raise RallyValidationError(unreachable_message(checkpoint_obj, progress))

    async def add_checkpoint(
        self, *, id: int, checkpoint_id: int, obj_in: TeamScoresUpdate, enforce_order: bool = True
    ) -> Team:
        """Record a team's arrival/score at a checkpoint and recompute classification.

        The transaction boundary: settings are resolved before the savepoint
        (``get_or_create`` may itself commit — event bootstrap, legacy
        adoption, timing sync — and a commit inside ``begin_nested()`` would
        close the outer transaction), scores are appended inside the
        savepoint, then the whole thing commits and classification recomputes.

        ``enforce_order`` is False only for the give-up path: ``SkipService``
        has already run the reachability guard *and* written the skip row, so
        the post is now resolved and ``_validate_checkpoint_order`` (which keys
        off ``len(team.times)``) would wrongly reject the very append that moves
        the team's pointer past it.
        """
        settings = await rally_settings.get_or_create(self._db)
        async with self._db.begin_nested():
            team = await self._team_crud.get(db=self._db, id=id, for_update=True)
            current_time = datetime.now(UTC)

            self._validate_rally_timing(
                settings,
                current_time,
                start_offset_minutes=team.start_offset_minutes or 0,
            )
            if enforce_order:
                await self._validate_checkpoint_order(team, checkpoint_id, settings)

            team.record_checkpoint(
                question_score=bool(obj_in.question_score),
                time_score=obj_in.time_score,
                pukes=obj_in.pukes,
                skips=obj_in.skips,
                at=current_time.replace(tzinfo=None),
            )

        await self._db.commit()
        await self.update_classification()
        await self._db.refresh(team)
        return team

    async def progress(self, team_obj: Team) -> TeamProgress:
        """This team's position on the route, from the single progress engine."""
        settings = await rally_settings.get_or_create(self._db)
        return await progress_for_team(self._db, team_obj, settings)

    async def compute_checkpoint_progress(
        self, team_obj: Team
    ) -> tuple[int, int | None, str | None]:
        """(last_completed_order, current_order, last_checkpoint_name).

        Kept as a convenience shape for the team schemas; the rules themselves
        live in ``route_progress.progress_for_team``, which is what makes the
        participant screen, the staff roster and the guide panel agree.

        ``current_order`` is None when there is no post left to send the team
        to — the route is finished, or there is no route. It used to clamp to
        the last post's order instead, which reads as "still working on the
        final post" and is indistinguishable from a team that genuinely is.
        """
        state = await self.progress(team_obj)
        return state.last_completed_order, state.current_order, state.last_completed_name

    async def build_listing_team(
        self,
        team: Team,
        *,
        reveal_next_checkpoint: bool = True,
        is_privileged: bool = False,
        hide_scores: bool = False,
    ) -> ListingTeam:
        """Build team data for listing using strict completion rules.

        ``last_checkpoint_name`` names a checkpoint this *other* team has
        completed, which can be ahead of the viewing team's own progress —
        in a peddy paper that name is the answer to a puzzle the viewer
        hasn't solved yet. Withheld from non-privileged viewers whenever
        ``reveal_next_checkpoint`` is off; staff/admin always see it.

        ``hide_scores`` blanks the points and the rank for
        ``show_score_mode == "hidden"``. The switch was read by the SPA only,
        so the standings it hides were served in full to anyone who asked the
        API for them.
        """
        state = await self.progress(team)
        last_checkpoint_name = state.last_completed_name
        if not reveal_next_checkpoint and not is_privileged:
            last_checkpoint_name = None

        return ListingTeam(
            id=team.id,
            name=team.name,
            total=0 if hide_scores else team.total,
            # 0 is outside the 1..N dense rank, and is what an unranked team
            # already carries.
            classification=0 if hide_scores else team.classification,
            versus_group_id=team.versus_group_id,
            start_offset_minutes=team.start_offset_minutes or 0,
            times=team.times,
            last_checkpoint_time=team.last_checkpoint_time,
            last_checkpoint_score=None if hide_scores else team.last_checkpoint_score,
            last_checkpoint_number=state.last_completed_order,
            last_checkpoint_name=last_checkpoint_name,
            current_checkpoint_number=state.current_order,
            resolved_checkpoint_orders=sorted(state.resolved_orders),
            open_checkpoint_orders=sorted(state.open_orders),
            is_route_finished=state.is_finished,
            num_members=team.num_members,
        )

    async def build_detailed_team(
        self,
        team_obj: Team,
        *,
        with_progress: bool = False,
        with_access_code: bool = False,
        hide_scores: bool = False,
    ) -> PrivilegedDetailedTeam:
        """Serialize a team, eager-loading the members relationship (the schema
        includes members, which would otherwise lazy-load).

        access_code is a login credential, so it is only populated when
        with_access_code is set — pass it only on routes restricted to the team
        itself or to admin/staff callers. Routes annotated with plain
        DetailedTeam drop the field entirely via the response model."""
        await self._db.refresh(team_obj, ["members"])
        result = PrivilegedDetailedTeam.model_validate(team_obj)
        if not with_access_code:
            result.access_code = None
        if hide_scores:
            # ``show_score_mode == "hidden"``: the total, the rank and the
            # per-post breakdown are the whole of what that switch hides.
            # 0 is outside the 1..N dense rank and is what an unranked team
            # already carries.
            result.total = 0
            result.classification = 0
            result.score_per_checkpoint = []
        if with_progress:
            state = await self.progress(team_obj)
            result.last_checkpoint_number = state.last_completed_order
            result.current_checkpoint_number = state.current_order
            result.resolved_checkpoint_orders = sorted(state.resolved_orders)
            result.open_checkpoint_orders = sorted(state.open_orders)
            result.is_route_finished = state.is_finished
            result.total_checkpoints = state.total_published
            if not hide_scores:
                result.penalties_per_checkpoint = await self._penalties_per_checkpoint(
                    team_obj
                )
        return result

    async def _penalties_per_checkpoint(self, team_obj: Team) -> list[CheckpointPenalties]:
        """Every point this team lost to hints, give-ups and activity
        penalties, grouped by post and summed per cause.

        The three sources live in separate tables and none is on ``Team``:
        ``checkpoint_hint_reveals`` and ``checkpoint_skips`` freeze the penalty
        at the price it was charged, and the activity deductions sit in each
        ``ActivityResult.penalties`` JSON blob. Posts with nothing to report
        are dropped so the list stays short.
        """
        team_id = team_obj.id

        order_by_cp_id: dict[int, int] = dict(
            (await self._db.execute(select(CheckPoint.id, CheckPoint.order))).all()
        )

        buckets: dict[int, dict[str, int]] = {}

        def bucket(checkpoint_id: int) -> dict[str, int]:
            return buckets.setdefault(
                checkpoint_id, {"hints_cost": 0, "skip_cost": 0, "activity_penalties": 0}
            )

        hint_rows = (
            await self._db.execute(
                select(
                    CheckpointHintReveal.checkpoint_id,
                    func.coalesce(func.sum(CheckpointHintReveal.cost), 0),
                )
                .where(CheckpointHintReveal.team_id == team_id)
                .group_by(CheckpointHintReveal.checkpoint_id)
            )
        ).all()
        for checkpoint_id, cost in hint_rows:
            bucket(checkpoint_id)["hints_cost"] += int(cost)

        skip_rows = (
            await self._db.execute(
                select(
                    CheckpointSkip.checkpoint_id,
                    func.coalesce(func.sum(CheckpointSkip.cost), 0),
                )
                .where(CheckpointSkip.team_id == team_id)
                .group_by(CheckpointSkip.checkpoint_id)
            )
        ).all()
        for checkpoint_id, cost in skip_rows:
            bucket(checkpoint_id)["skip_cost"] += int(cost)

        # Activity penalties are a JSON dict of positive magnitudes deducted
        # from the activity's score, so they are negated here to match the
        # negative sign every other penalty carries.
        penalty_rows = (
            await self._db.execute(
                select(Activity.checkpoint_id, ActivityResult.penalties)
                .join(Activity, Activity.id == ActivityResult.activity_id)
                .where(
                    ActivityResult.team_id == team_id,
                    Activity.checkpoint_id.is_not(None),
                )
            )
        ).all()
        for checkpoint_id, penalties in penalty_rows:
            deducted = sum(int(v) for v in (penalties or {}).values())
            if deducted:
                bucket(checkpoint_id)["activity_penalties"] -= deducted

        out: list[CheckpointPenalties] = []
        for checkpoint_id, parts in buckets.items():
            order = order_by_cp_id.get(checkpoint_id)
            if order is None:
                continue
            total = parts["hints_cost"] + parts["skip_cost"] + parts["activity_penalties"]
            if total == 0:
                continue
            out.append(
                CheckpointPenalties(
                    checkpoint_order=order,
                    checkpoint_id=checkpoint_id,
                    hints_cost=parts["hints_cost"],
                    skip_cost=parts["skip_cost"],
                    activity_penalties=parts["activity_penalties"],
                    total=total,
                )
            )
        out.sort(key=lambda p: p.checkpoint_order)
        return out
