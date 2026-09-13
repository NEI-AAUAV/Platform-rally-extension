"""Recording that a team was at a post.

The ``CheckpointArrival`` row is the single record of "the team was here". Its
unique constraint on ``(team_id, checkpoint_id)`` is the idempotency token for
the whole system: if the row already exists, the visit is already recorded and
nothing else runs.

There used to be a second ledger, ``Team.times``, an unkeyed array appended in
visit order next to parallel score arrays indexed by route position. Keeping
the two in step needed a reconcile path, and any route edit after the first
check-in risked pairing a post with another post's data. Progress is now read
straight from the arrival, skip and result rows (see
``app.services.team_checkpoint_progress``).
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError
from app.crud.crud_team import team as team_crud
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import ArrivalSource, CheckpointArrival
from app.services.team_service import TeamService


async def insert_arrival(
    db: AsyncSession,
    *,
    team_id: int,
    checkpoint_id: int,
    latitude: float | None = None,
    longitude: float | None = None,
    source: ArrivalSource | None = None,
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
        source=source,
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
    source: ArrivalSource | None = None,
    enforce_order: bool = True,
    commit: bool = True,
) -> bool:
    """Record a team's visit to a post, once. Returns True if this call recorded it.

    The arrival row is claimed first and is what makes this idempotent: a
    second call for the same pair returns False without validating or writing
    anything, so no path can record a visit twice.

    The claim is made on a SAVEPOINT and validated in the same transaction —
    the event window, and the route order unless ``enforce_order`` is False
    (for callers that already ran the reachability check). A validation error
    propagates with the claim still uncommitted, so the caller's rollback
    discards it instead of leaving an arrival for a visit that was refused.
    """
    # A missing post would surface as an FK violation, which insert_arrival
    # reads as a lost race and answers "already recorded".
    if await db.get(CheckPoint, checkpoint_id) is None:
        raise RallyNotFoundError("Checkpoint not found")

    arrival = await insert_arrival(
        db,
        team_id=team_id,
        checkpoint_id=checkpoint_id,
        latitude=latitude,
        longitude=longitude,
        source=source,
        commit=False,
    )
    if arrival is None:
        return False

    await TeamService(db, team_crud).validate_visit(
        team_id=team_id, checkpoint_id=checkpoint_id, enforce_order=enforce_order
    )
    if commit:
        await db.commit()
    return True
