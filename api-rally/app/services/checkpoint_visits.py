"""Recording that a team was at a post.

There used to be two disjoint ledgers. ``CheckpointArrival`` named the post and
was written only by the GPS and guide paths; ``team.times`` was an unkeyed
array append written by everything else (QR self-check-in, staff scan, staff
evaluation, give-up). Nothing reconciled them, so the guide's panel could not
see a team that scanned a QR code, a no-activity post completed by QR never
resolved at all, and the array — being a bare count — was double-appended by
several paths at once.

This module makes the arrival row the single record of "the team was here", and
``team.times`` what its name says: the visit timestamps, one per arrival. The
unique constraint on ``(team_id, checkpoint_id)`` is therefore the idempotency
token for the whole system: if the row already exists, the visit is already
recorded and nothing else runs.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_team import team as team_crud
from app.models.checkpoint_arrival import CheckpointArrival
from app.schemas.team import TeamScoresUpdate


async def insert_arrival(
    db: AsyncSession,
    *,
    team_id: int,
    checkpoint_id: int,
    latitude: float | None = None,
    longitude: float | None = None,
) -> CheckpointArrival | None:
    """Idempotent insert. Returns the created row, or ``None`` when an arrival
    for this (team, checkpoint) pair already existed.

    ``latitude``/``longitude`` are None for every path that is not a GPS fix —
    a guide vouching, a QR scan, a staff evaluation — which is what
    ``GuideService.teams_at_checkpoint`` reads to label an arrival as vouched
    for rather than measured.
    """
    existing = await db.scalar(
        select(CheckpointArrival).where(
            CheckpointArrival.team_id == team_id,
            CheckpointArrival.checkpoint_id == checkpoint_id,
        )
    )
    if existing is not None:
        return None

    arrival = CheckpointArrival(
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        latitude=latitude,
        longitude=longitude,
    )
    db.add(arrival)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent arrival for the same pair.
        await db.rollback()
        return None
    # arrived_at is a server_default, only populated on the DB side.
    await db.refresh(arrival)
    return arrival


async def record_visit(
    db: AsyncSession,
    *,
    team_id: int,
    checkpoint_id: int,
    latitude: float | None = None,
    longitude: float | None = None,
    enforce_order: bool = True,
) -> bool:
    """Record a team's visit to a post, once. Returns True if this call recorded it.

    The arrival row is claimed first and is what makes this idempotent: a
    second call for the same pair returns False before touching ``team.times``,
    so no path can advance a team twice. That single rule replaces the
    per-caller guards that each got it wrong in a different way — a repeated
    GPS tap appending one visit per tap, and a staff evaluation appending both
    a check-in and a "next post" pointer for one post.

    ``enforce_order`` is False for callers that have already run the
    reachability check themselves.
    """
    arrival = await insert_arrival(
        db,
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        latitude=latitude,
        longitude=longitude,
    )
    if arrival is None:
        return False

    await team_crud.add_checkpoint(
        db=db,
        id=team_id,
        checkpoint_id=checkpoint_id,
        obj_in=TeamScoresUpdate(
            checkpoint_id=checkpoint_id,
            question_score=0,
            time_score=0,
            pukes=0,
            skips=0,
        ),
        enforce_order=enforce_order,
    )
    return True
