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

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_team import team as team_crud
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.team import Team
from app.schemas.team import TeamScoresUpdate


async def insert_arrival(
    db: AsyncSession,
    *,
    team_id: int,
    checkpoint_id: int,
    latitude: float | None = None,
    longitude: float | None = None,
    commit: bool = True,
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
    if commit:
        db.add(arrival)
        try:
            await db.commit()
        except IntegrityError:
            # Lost a race against a concurrent arrival for the same pair.
            await db.rollback()
            return None
    else:
        try:
            async with db.begin_nested():
                db.add(arrival)
                await db.flush()
        except IntegrityError:
            # Lost a race against a concurrent arrival for the same pair. The
            # savepoint rolls back only this insert; the caller's transaction
            # stays intact.
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
    commit: bool = True,
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

    The arrival claim and the ``team.times`` stamp are one durability boundary:
    the claim is made on a SAVEPOINT and the visit entry appended in the same
    transaction, so a failure after the claim rolls the claim back too instead
    of leaving an arrival row with no matching visit timestamp. A retry whose
    claim already exists (a prior call that committed the arrival but crashed
    before the stamp) reconciles the missing entry rather than returning
    silently and leaving the inconsistency permanent.
    """
    # Claim on a savepoint regardless of ``commit`` so the claim and the visit
    # append commit together (or not at all).
    arrival = await insert_arrival(
        db,
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        latitude=latitude,
        longitude=longitude,
        commit=False,
    )
    if arrival is None:
        repaired = await _reconcile_missing_visit(
            db, team_id=team_id, checkpoint_id=checkpoint_id
        )
        if commit and repaired:
            await db.commit()
        return False

    await append_visit_entry(
        db,
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        enforce_order=enforce_order,
        commit=False,
    )
    if commit:
        await db.commit()
    return True


async def _reconcile_missing_visit(
    db: AsyncSession, *, team_id: int, checkpoint_id: int
) -> bool:
    """Repair a ``team.times`` entry owed by an already-claimed arrival.

    The arrival row is the durable claim; ``team.times`` carries one timestamp
    per arrival. When a prior call committed the arrival and then failed before
    the stamp, the team has more arrivals than visit entries — append the
    missing one. Returns True when a repair was made.

    ``enforce_order`` is always False here: the arrival row already proves the
    team was entitled to be at the post, and the order guard keys off
    ``len(team.times)`` — which is exactly what is short by one.
    """
    arrivals = await db.scalar(
        select(func.count())
        .select_from(CheckpointArrival)
        .where(CheckpointArrival.team_id == team_id)
    )
    team = await db.get(Team, team_id)
    if team is None or not arrivals:
        return False
    if len(team.times or []) >= arrivals:
        return False

    await append_visit_entry(
        db,
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        enforce_order=False,
        commit=False,
    )
    return True


async def append_visit_entry(
    db: AsyncSession,
    *,
    team_id: int,
    checkpoint_id: int,
    enforce_order: bool = True,
    commit: bool = True,
) -> None:
    """Stamp the visit on ``team.times`` (and the parallel score arrays).

    Split out of :func:`record_visit` for the one caller that has *already*
    claimed the arrival row itself and is still owed the timestamp: the GPS and
    guide arrival paths write the arrival as a fact first, and only afterwards
    decide whether that arrival also completes the post. Going back through
    ``record_visit`` there recorded nothing at all — the claim it uses as its
    idempotency token was the arrival the same request had just written, so it
    returned False and the visit never reached ``team.times``.

    This function has no idempotency of its own: call it once per claimed
    arrival, exactly where the claim happened.
    """
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
        commit=commit,
    )
