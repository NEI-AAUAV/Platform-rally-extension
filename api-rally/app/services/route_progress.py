"""Where a team may go next.

One entry point, ``can_reach_checkpoint``, answers that for every caller that
used to ask ``is_checkpoint_reachable`` directly: GPS arrival, the skip escape
hatch, hint purchases, the proximity aid and the staff-side order validation.
Routing them all through here is what keeps a stage rule, an opening hour and
the plain sequential rule from disagreeing with each other.

The count-based predicate still lives here and still runs every event that has
no stages — that is the behaviour the whole app had before stages existed.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_activity import activity as activity_crud
from app.crud.crud_activity import activity_result as activity_result_crud
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
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


def is_checkpoint_reachable(
    *, checkpoint_order: int, times_reached: int, order_matters: bool
) -> bool:
    """Whether a team that has resolved ``times_reached`` checkpoints may check
    into one of order ``checkpoint_order``.

    ``times_reached`` is a count of genuinely resolved posts (arrivals, skips,
    scored activities) — never ``len(team.times)``, which
    ``advance_team_to_next_checkpoint`` inflates with a "next post" pointer.

    The rule for a route without stages: with ``checkpoint_order_matters`` on,
    posts must be visited strictly in sequence; with it off, any order the team
    has not got to yet is fair game.
    """
    if order_matters:
        return times_reached == checkpoint_order - 1
    return checkpoint_order > times_reached


async def resolved_checkpoint_orders(
    db: AsyncSession, team: Team, *, ignore_arrival_for: int | None = None
) -> frozenset[int]:
    """The orders of the posts this team is done with.

    "Done with" covers all three ways a post stops being the team's problem:
    its activities were all scored, the team gave up on it, or — for a post
    with nothing to judge — the team simply turned up. Arrivals are read from
    the arrivals table rather than inferred from ``len(team.times)``, because
    in a free-choice stage the count says how many posts a team has done but
    not which ones.

    ``ignore_arrival_for`` (a checkpoint id) exists for one reason: a GPS
    arrival is recorded — unconditionally, as a fact — *before* this function
    ever runs to decide whether that same arrival gets to advance the team.
    For a no-activity post that means its own just-written arrival row would
    otherwise mark it "already resolved", and the reachability check built on
    top of this set would then refuse the very checkpoint being evaluated.
    Every caller checking a specific target passes that target's id here.
    """
    checkpoints = await checkpoint_crud.get_all_ordered(db)
    skipped_ids = set(
        (
            await db.scalars(
                select(CheckpointSkip.checkpoint_id).where(CheckpointSkip.team_id == team.id)
            )
        ).all()
    )
    arrived_ids = set(
        (
            await db.scalars(
                select(CheckpointArrival.checkpoint_id).where(CheckpointArrival.team_id == team.id)
            )
        ).all()
    )
    results = await activity_result_crud.get_by_team(db, team_id=team.id)
    completed_activity_ids = {r.activity_id for r in results if getattr(r, "is_completed", False)}

    resolved: set[int] = set()
    for cp in checkpoints:
        if cp.id in skipped_ids:
            resolved.add(cp.order)
            continue
        activities = await activity_crud.get_by_checkpoint(db, checkpoint_id=cp.id)
        active_ids = [a.id for a in activities if a.is_active]
        if active_ids:
            if all(aid in completed_activity_ids for aid in active_ids):
                resolved.add(cp.order)
        elif cp.id in arrived_ids and cp.id != ignore_arrival_for:
            resolved.add(cp.order)
    return frozenset(resolved)


async def load_stages(db: AsyncSession) -> list[Stage]:
    """The current event's stages, each carrying the orders of its posts.

    Draft posts are left out: a stage's required count must be reachable, and
    a post nobody can visit would make it permanently short.
    """
    stage_rows = (await db.scalars(select(RouteStage).order_by(RouteStage.order))).all()
    if not stage_rows:
        return []

    orders_by_stage: dict[int, list[int]] = {}
    for cp in await checkpoint_crud.get_all_ordered(db):
        if cp.stage_id is not None:
            orders_by_stage.setdefault(cp.stage_id, []).append(cp.order)

    return build_stages(
        ((s.id, s.order, bool(s.order_matters), s.required_count) for s in stage_rows),
        orders_by_stage,
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


async def can_reach_checkpoint(
    db: AsyncSession,
    *,
    team: Team,
    checkpoint: CheckPoint,
    settings: Any,
    now: datetime | None = None,
    enforce_hours: bool = True,
) -> bool:
    """Whether this team may check into this post right now.

    ``enforce_hours`` separates *checking in* from *working on the post*.
    Arrivals and staff evaluations mean "the team was here", so a closed bar
    refuses them. Buying a hint, sampling proximity or giving up are about the
    riddle, which a team may perfectly well be solving an hour before the door
    opens — those callers pass False.
    """
    if enforce_hours and hours_block_reason(checkpoint, settings, now) is not None:
        return False

    if getattr(settings, "route_stages_enabled", False):
        stages = await load_stages(db)
        if stages:
            return is_reachable_in_stages(
                checkpoint_order=checkpoint.order,
                stages=stages,
                resolved_orders=await resolved_checkpoint_orders(
                    db, team, ignore_arrival_for=checkpoint.id
                ),
            )

    # Count of posts the team is actually done with — not ``len(team.times)``,
    # which ``advance_team_to_next_checkpoint`` inflates by one with a pointer at
    # the next post the team has not reached yet. The target's own order is
    # excluded for the same reason ``ignore_arrival_for`` exists: a post the team
    # is being checked into (or is hunting) must not count itself as resolved.
    resolved = await resolved_checkpoint_orders(db, team, ignore_arrival_for=checkpoint.id)
    return is_checkpoint_reachable(
        checkpoint_order=checkpoint.order,
        times_reached=len(resolved - {checkpoint.order}),
        order_matters=bool(getattr(settings, "checkpoint_order_matters", True)),
    )
