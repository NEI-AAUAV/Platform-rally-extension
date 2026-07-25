"""GPS geofence arrive endpoint (A2).

Team app posts its current GPS coords; server checks distance vs
checkpoint.arrival_radius_m and records idempotent arrival.
Only available when the current event is PEDDY_PAPER.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.crud import crud_activity
from app.models.activity import EventType
from app.models.checkpoint_arrival import CheckpointArrival
from app.schemas.team_auth import TeamTokenData
from app.utils.geo import distance_m

router = APIRouter()


class ArriveRequest(BaseModel):
    latitude: float
    longitude: float


class ArriveResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    distance_m: float
    already_registered: bool
    # True when the checkpoint had no activities and the team was advanced
    # straight past it on check-in (no staff evaluation needed).
    auto_completed: bool = False


async def _auto_complete_if_no_activities(
    db: AsyncSession, team_id: int, checkpoint_id: int
) -> bool:
    """Mark a no-activity checkpoint as completed on GPS arrival and advance.

    Peddy-paper posts that only require *being there* (no staff-judged
    activity) should not wait for an evaluation that will never come. When a
    team checks in at such a post and it is the post they are currently due to
    reach, we check them in — which appends this checkpoint to team.times and
    moves their "current" pointer to the next post.

    Posts that DO have activities are left untouched: those only advance once
    staff submits the activity result (handled by check_and_advance_team).
    """
    # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
    # rather than returning None, so this branch is unreachable in practice
    # (the caller already validated the checkpoint exists); kept defensively.
    checkpoint_obj = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not checkpoint_obj:
        return False

    activities = await crud_activity.activity.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
    if any(a.is_active for a in activities):
        return False  # has activities → staff-driven advancement

    # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
    # rather than returning None, so this branch is unreachable in practice
    # (a team with a valid arrival JWT necessarily still exists); kept as a
    # defensive guard.
    team_obj = await crud.team.get(db=db, id=team_id)
    if not team_obj:
        return False

    # Only auto-advance when this is exactly the post the team is due to reach;
    # add_checkpoint's order validation would reject out-of-sequence check-ins
    # anyway, but guarding here avoids noisy 400s in the logs.
    if len(team_obj.times) != checkpoint_obj.order - 1:
        return False

    try:
        await checkin_team_to_checkpoint(db, team_id, checkpoint_id)
        return True
    except Exception as exc:  # advancement is best-effort; arrival still succeeds
        logger.warning(
            f"Auto-complete on arrival failed for team {team_id} "
            f"at checkpoint {checkpoint_id}: {exc}"
        )
        return False


@router.post(
    "/checkpoint/{checkpoint_id}/arrive",
    responses={
        400: {
            "description": "GPS check-in unavailable, missing coordinates, or too far from checkpoint"
        },
        404: {"description": "Checkpoint not found"},
    },
)
async def arrive_at_checkpoint(
    checkpoint_id: int,
    body: ArriveRequest,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
) -> ArriveResponse:
    event = await crud_activity.rally_event.get_current(db)
    if not event or event.event_type != EventType.PEDDY_PAPER.value:
        raise HTTPException(
            status_code=400, detail="GPS check-in only available for Peddy Paper events"
        )

    # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
    # (mapped to 404 by the app's exception handler), so this branch is
    # unreachable in practice; kept as a defensive guard.
    checkpoint = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    if checkpoint.latitude is None or checkpoint.longitude is None:
        raise HTTPException(status_code=400, detail="Checkpoint has no GPS coordinates")

    dist = distance_m(body.latitude, body.longitude, checkpoint.latitude, checkpoint.longitude)

    if dist > checkpoint.arrival_radius_m:
        raise HTTPException(
            status_code=400,
            detail=f"Too far from checkpoint: {dist:.0f}m (max {checkpoint.arrival_radius_m}m)",
        )

    # Check if already registered (idempotent)
    existing = await db.execute(
        select(CheckpointArrival).where(
            CheckpointArrival.team_id == team.team_id,
            CheckpointArrival.checkpoint_id == checkpoint_id,
        )
    )
    already_registered = existing.scalars().first() is not None

    if not already_registered:
        arrival = CheckpointArrival(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            latitude=body.latitude,
            longitude=body.longitude,
        )
        db.add(arrival)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            already_registered = True

    # No-activity posts complete immediately on arrival; posts with activities
    # wait for staff to submit the result before the team advances. Run this on
    # every check-in (including repeats): the order guard inside makes it a
    # no-op once the team has already advanced, so a team that arrived before
    # this behaviour existed still gets unstuck on their next check-in.
    auto_completed = await _auto_complete_if_no_activities(db, team.team_id, checkpoint_id)

    return ArriveResponse(
        team_id=team.team_id,
        checkpoint_id=checkpoint_id,
        distance_m=round(dist, 1),
        already_registered=already_registered,
        auto_completed=auto_completed,
    )
