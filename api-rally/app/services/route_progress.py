"""Where a team stands on the route, and where it may go next.

One entry point — :func:`progress_for_team` — answers every progress question
the system asks, and every other module delegates to it. Before this existed
there were three implementations (``TeamService.compute_checkpoint_progress``,
``staff_evaluation_utils.compute_checkpoint_progress`` and the count-based
predicates here) which disagreed on the completion predicate, ignored stages,
and degraded free-order routes to sequential ones. A single engine is what
keeps a stage rule, an opening hour and the plain sequential rule from
contradicting each other on the same screen.

The model works on **resolved orders** — the set of posts a team is done with —
rather than on ``len(team.times)``. A count is enough only while the whole route
is walked in sequence: a free-choice stage where the team picks three bars out
of five breaks it, and so does the "next post" pointer that the staff-evaluation
path appends to ``team.times`` for a post the team has not reached yet.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.services.route_stages import (
    Stage,
    build_stages,
    is_open_at,
    is_reachable_in_stages,
    opening_state,
)


@dataclass(frozen=True)
class RouteSnapshot:
    """The event's route, loaded once and reusable across teams.

    Everything in here is per-*event*, not per-team, so a caller scoring a
    roster of teams (the staff screen, the scoreboard) builds it once instead
    of paying for the checkpoint list, every post's activities and the stage
    table on each team.
    """

    checkpoints: Sequence[CheckPoint]
    activities: Mapping[int, Sequence[Activity]]
    stages: Sequence[Stage]
    order_matters: bool


@dataclass(frozen=True)
class TeamProgress:
    """Everything the system needs to know about a team's position on the route.

    ``resolved_orders`` is "posts the team is done with", by any of the three
    routes out of a post: every active activity scored, the team gave up, or —
    for a post with nothing to judge — the team turned up.

    ``open_orders`` is "posts the team may check into right now", which is a
    *set* rather than a single number: a free-choice stage opens several at
    once, and so does ``checkpoint_order_matters=False``. Opening hours are
    deliberately **not** applied here — a team may be solving a riddle an hour
    before the bar opens, and only the write paths that mean "the team was
    here" enforce the window (see :func:`can_reach_checkpoint`).

    ``current_order`` is the lowest open post, the single pointer the
    participant screen builds its "próximo posto" card from. ``None`` means
    there is nothing left to send the team to.
    """

    resolved_orders: frozenset[int]
    open_orders: frozenset[int]
    current_order: int | None
    last_completed_order: int
    last_completed_name: str | None
    is_finished: bool
    total_published: int

    def is_resolved(self, order: int) -> bool:
        return order in self.resolved_orders

    def is_open(self, order: int) -> bool:
        return order in self.open_orders


async def _load_stages(db: AsyncSession, checkpoints: Sequence[CheckPoint]) -> list[Stage]:
    """The current event's stages, each carrying the orders of its posts.

    Takes the already-loaded checkpoint list rather than re-querying it. Draft
    posts are excluded (they are not in ``checkpoints``): a stage's required
    count must be reachable, and a post nobody can visit would make it
    permanently short.
    """
    stage_rows = (await db.scalars(select(RouteStage).order_by(RouteStage.order))).all()
    if not stage_rows:
        return []

    orders_by_stage: dict[int, list[int]] = {}
    for cp in checkpoints:
        if cp.stage_id is not None:
            orders_by_stage.setdefault(cp.stage_id, []).append(cp.order)

    return build_stages(
        ((s.id, s.order, bool(s.order_matters), s.required_count) for s in stage_rows),
        orders_by_stage,
    )


async def load_stages(db: AsyncSession) -> list[Stage]:
    """Public wrapper for callers that have no checkpoint list to hand."""
    return await _load_stages(db, await checkpoint_crud.get_all_ordered(db))


async def _activities_by_checkpoint(
    db: AsyncSession, checkpoint_ids: Sequence[int]
) -> dict[int, list[Activity]]:
    """Every activity of every given post in one query, inactive ones included.

    Inactive rows are kept deliberately: a post whose only activity an admin
    switched off mid-event must not silently become a "no-activity post" that
    needs a fresh arrival row to resolve — see :func:`_is_resolved`.
    """
    if not checkpoint_ids:
        return {}
    stmt = select(Activity).where(Activity.checkpoint_id.in_(checkpoint_ids))
    grouped: dict[int, list[Activity]] = {cid: [] for cid in checkpoint_ids}
    for act in (await db.scalars(stmt)).all():
        if act.checkpoint_id is not None:
            grouped.setdefault(act.checkpoint_id, []).append(act)
    return grouped


def _is_resolved(
    checkpoint: CheckPoint,
    *,
    activities: Sequence[Activity],
    scored_activity_ids: frozenset[int],
    arrived_ids: frozenset[int],
    ignore_arrival_for: int | None,
) -> bool:
    """Whether this post has stopped being the team's problem.

    Three ways out, in the order they are checked:

    * every **active** activity here has a scored result;
    * the post has no active activity left, but the team already has a scored
      result for one of its (now inactive) activities — deactivating an
      activity must not walk a team's progress backwards;
    * the post has nothing to judge and the team physically arrived.

    Skips are handled by the caller, which knows whether it wants them.
    """
    active_ids = [a.id for a in activities if a.is_active]
    if active_ids:
        return all(aid in scored_activity_ids for aid in active_ids)
    if any(a.id in scored_activity_ids for a in activities):
        return True
    return checkpoint.id in arrived_ids and checkpoint.id != ignore_arrival_for


def _open_orders(
    *,
    checkpoints: Sequence[CheckPoint],
    resolved: frozenset[int],
    stages: Sequence[Stage],
    order_matters: bool,
) -> frozenset[int]:
    """The posts a team may check into right now.

    Stages first when the route has them, then the event-wide ordering rule:

    * **free order** — every post the team has not finished is fair game. This
      is a membership test over the resolved set, not the count comparison it
      used to be (``order > len(team.times)``), which refused every low-order
      post a team had not visited as soon as its visit count passed that order.
    * **sequential** — the first unresolved post in route order. Giving up
      resolves a post, so the escape hatch moves the team on by exactly one;
      it cannot be chained past the next post, because that one is then the
      first unresolved and nothing beyond it is open.
    """
    if stages:
        return frozenset(
            cp.order
            for cp in checkpoints
            if is_reachable_in_stages(
                checkpoint_order=cp.order, stages=stages, resolved_orders=resolved
            )
        )

    unresolved = [cp.order for cp in checkpoints if cp.order not in resolved]
    if not unresolved:
        return frozenset()
    if not order_matters:
        return frozenset(unresolved)
    return frozenset({unresolved[0]})


def _contiguous_prefix(
    checkpoints: Sequence[CheckPoint], resolved: frozenset[int]
) -> tuple[int, str | None]:
    """The longest run of resolved posts from the start of the route.

    ``last_completed_order`` has always meant "how far the team has got" in a
    sequential sense — the progress bar and the staff roster both read it that
    way — so it stays a prefix even when the route is free-order and the
    resolved set has holes.
    """
    last_order = 0
    last_name: str | None = None
    for cp in checkpoints:
        if cp.order not in resolved:
            break
        last_order = cp.order
        last_name = cp.name
    return last_order, last_name


async def load_route_snapshot(db: AsyncSession, settings: Any) -> RouteSnapshot:
    """Load the per-event half of the progress calculation, once."""
    checkpoints = list(await checkpoint_crud.get_all_ordered(db))
    return RouteSnapshot(
        checkpoints=checkpoints,
        activities=await _activities_by_checkpoint(db, [cp.id for cp in checkpoints]),
        stages=(
            await _load_stages(db, checkpoints)
            if getattr(settings, "route_stages_enabled", False)
            else []
        ),
        order_matters=bool(getattr(settings, "checkpoint_order_matters", True)),
    )


async def progress_for_team(
    db: AsyncSession,
    team: Team,
    settings: Any,
    *,
    ignore_arrival_for: int | None = None,
    route: RouteSnapshot | None = None,
) -> TeamProgress:
    """The single source of truth for a team's position on the route.

    ``ignore_arrival_for`` (a checkpoint id) exists for one caller: a GPS or
    guide arrival is recorded — unconditionally, as a fact — *before* anything
    decides whether that same arrival gets to advance the team. For a
    no-activity post its own just-written arrival row would otherwise mark it
    resolved, and the post would no longer be open, so the check would refuse
    the very arrival being evaluated.

    ``route`` lets a caller iterating over many teams load the event-wide half
    once (see :func:`load_route_snapshot`); omit it and it is loaded per call.
    """
    if route is None:
        route = await load_route_snapshot(db, settings)
    checkpoints = route.checkpoints
    if not checkpoints:
        return TeamProgress(
            resolved_orders=frozenset(),
            open_orders=frozenset(),
            current_order=None,
            last_completed_order=0,
            last_completed_name=None,
            is_finished=False,
            total_published=0,
        )

    activities = route.activities

    skipped_ids = frozenset(
        (
            await db.scalars(
                select(CheckpointSkip.checkpoint_id).where(CheckpointSkip.team_id == team.id)
            )
        ).all()
    )
    arrived_ids = frozenset(
        (
            await db.scalars(
                select(CheckpointArrival.checkpoint_id).where(CheckpointArrival.team_id == team.id)
            )
        ).all()
    )
    results = (
        await db.scalars(select(ActivityResult).where(ActivityResult.team_id == team.id))
    ).all()
    # ``is_scored``, never ``is_completed`` alone: a deferred-judged capture
    # sets is_completed=True at capture time, before a judge has given it a
    # score. See ActivityResult.is_scored.
    scored_activity_ids = frozenset(r.activity_id for r in results if r.is_scored)

    resolved = frozenset(
        cp.order
        for cp in checkpoints
        if cp.id in skipped_ids
        or _is_resolved(
            cp,
            activities=activities.get(cp.id, []),
            scored_activity_ids=scored_activity_ids,
            arrived_ids=arrived_ids,
            ignore_arrival_for=ignore_arrival_for,
        )
    )

    open_orders = _open_orders(
        checkpoints=checkpoints,
        resolved=resolved,
        stages=route.stages,
        order_matters=route.order_matters,
    )
    last_completed_order, last_completed_name = _contiguous_prefix(checkpoints, resolved)

    return TeamProgress(
        resolved_orders=resolved,
        open_orders=open_orders,
        current_order=min(open_orders) if open_orders else None,
        last_completed_order=last_completed_order,
        last_completed_name=last_completed_name,
        is_finished=not open_orders,
        total_published=len(checkpoints),
    )


def hours_block_reason(
    checkpoint: CheckPoint, settings: Any, now: datetime | None = None
) -> str | None:
    """``None`` when the post is open, else ``"not_yet"`` / ``"closed"``."""
    if not getattr(settings, "checkpoint_hours_enabled", True):
        return None
    moment = now or datetime.now(UTC)
    if is_open_at(
        available_from=checkpoint.available_from,
        available_until=checkpoint.available_until,
        now=moment,
    ):
        return None
    return opening_state(
        available_from=checkpoint.available_from,
        available_until=checkpoint.available_until,
        now=moment,
    )


def closed_message(checkpoint: CheckPoint, reason: str) -> str:
    """Why a post refused the arrival, in words a team can act on.

    The opening time is not a secret worth redacting: a team standing at a
    closed door already knows where the post is.
    """
    if reason == "not_yet" and checkpoint.available_from is not None:
        return f"Checkpoint is not open yet. Opens at {checkpoint.available_from.isoformat()}"
    if reason == "closed" and checkpoint.available_until is not None:
        return f"Checkpoint has closed. Closed at {checkpoint.available_until.isoformat()}"
    return "Checkpoint is closed right now"


def unreachable_message(checkpoint: CheckPoint, progress: TeamProgress) -> str:
    """Why this post refused the team, distinguishing the two real cases.

    "Already visited" used to be reported for a post the team had never been
    near — under free order a low-order post was refused purely because the
    team's visit count had passed it.
    """
    if checkpoint.order in progress.resolved_orders:
        return f"Checkpoint {checkpoint.order} already visited"
    if progress.current_order is None:
        return "The route is finished — there is no post left to check into"
    return (
        f"Checkpoint not in order. Expected one of "
        f"{sorted(progress.open_orders)}, got {checkpoint.order}"
    )


async def can_reach_checkpoint(
    db: AsyncSession,
    *,
    team: Team,
    checkpoint: CheckPoint,
    settings: Any,
    now: datetime | None = None,
    enforce_hours: bool = True,
    ignore_arrival_for: int | None = None,
    progress: TeamProgress | None = None,
) -> bool:
    """Whether this team may check into this post right now.

    ``enforce_hours`` separates *checking in* from *working on the post*.
    Arrivals and staff evaluations mean "the team was here", so a closed bar
    refuses them. Buying a hint, sampling proximity or giving up are about the
    riddle, which a team may perfectly well be solving an hour before the door
    opens — those callers pass False.

    Pass ``progress`` when the caller has already computed it, so a single
    request does not build the same state twice.
    """
    if enforce_hours and hours_block_reason(checkpoint, settings, now) is not None:
        return False
    if progress is None:
        progress = await progress_for_team(
            db, team, settings, ignore_arrival_for=ignore_arrival_for
        )
    return progress.is_open(checkpoint.order)


async def resolved_checkpoint_orders(
    db: AsyncSession, team: Team, settings: Any, *, ignore_arrival_for: int | None = None
) -> frozenset[int]:
    """The orders of the posts this team is done with. Thin wrapper kept for
    callers that need only the set."""
    progress = await progress_for_team(db, team, settings, ignore_arrival_for=ignore_arrival_for)
    return progress.resolved_orders


async def current_checkpoint_order(db: AsyncSession, team: Team, settings: Any) -> int | None:
    """The order of the post a team is due to reach next, or ``None`` when the
    route is finished."""
    progress = await progress_for_team(db, team, settings)
    return progress.current_order
