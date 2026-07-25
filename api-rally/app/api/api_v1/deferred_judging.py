"""Deferred-judged activity endpoints (B3).

Staff capture: POST /activities/deferred/{activity_id}/capture
  - Requires staff at the checkpoint; uploads photo(s) via multipart
  - Creates ActivityResult with judgment_status='pending_judgment', no score

Admin judge: PUT /activities/results/{result_id}/judge
  - Admin only; sets points + marks as 'judged' + is_completed=True
  - Scoring then includes this result in the team total

Admin list: GET /activities/deferred/pending
  - Lists all pending_judgment results for the judging panel
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import get_staff_with_checkpoint_access
from app.crud.crud_activity import activity as crud_activity
from app.models.activity import ActivityResult
from app.schemas.activity_types import ActivityType
from app.services.deferred_judging_service import DeferredJudgingService
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store

router = APIRouter()


class JudgeRequest(BaseModel):
    points: float
    notes: str | None = None


class SetTeamPhotoRequest(BaseModel):
    image_url: str


class SetTeamPhotoResponse(BaseModel):
    team_id: int
    photo_url: str


class DeferredResultResponse(BaseModel):
    id: int
    activity_id: int
    team_id: int
    judgment_status: str | None = None
    media_urls: list[str]
    final_score: float | None = None
    is_completed: bool

    @classmethod
    def from_result(cls, result: ActivityResult) -> "DeferredResultResponse":
        return cls(
            id=result.id,
            activity_id=result.activity_id,
            team_id=result.team_id,
            judgment_status=result.judgment_status,
            media_urls=result.media_urls or [],
            final_score=result.final_score,
            is_completed=result.is_completed,
        )


@router.post(
    "/activities/deferred/{activity_id}/capture",
    status_code=201,
    responses={
        404: {"description": "Activity not found"},
        400: {"description": "Activity is not deferred-judged type, or team_id is missing"},
    },
)
async def capture_deferred_result(
    activity_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    _: Annotated[object, Depends(get_staff_with_checkpoint_access)],
    images: Annotated[list[UploadFile], File()] = None,
    team_id: int = 0,
) -> DeferredResultResponse:
    activity = await crud_activity.get(db, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.activity_type != ActivityType.DEFERRED_JUDGED.value:
        raise HTTPException(status_code=400, detail="Activity is not deferred-judged type")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")

    # Upload images
    urls: list[str] = []
    for image in images or []:
        if image and image.filename:
            url = await validate_and_store(
                image=image,
                allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
                key_prefix=f"rally/deferred/{activity_id}/{team_id}",
            )
            urls.append(url)

    result = await DeferredJudgingService(db).capture_result(
        activity_id=activity_id, team_id=team_id, media_urls=urls
    )
    return DeferredResultResponse.from_result(result)


@router.put(
    "/activities/results/{result_id}/judge",
    dependencies=[Depends(deps.get_admin)],
    responses={
        404: {"description": "Result not found"},
        400: {"description": "Result is not pending judgment"},
    },
)
async def judge_deferred_result(
    result_id: int,
    body: JudgeRequest,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> DeferredResultResponse:
    result = await DeferredJudgingService(db).judge_result(
        result_id, points=body.points, notes=body.notes
    )
    return DeferredResultResponse.from_result(result)


@router.put(
    "/activities/results/{result_id}/set-team-photo",
    responses={
        403: {"description": "Setting a team photo from an activity photo is disabled"},
        404: {"description": "Result not found"},
        400: {"description": "Photo does not belong to this result"},
    },
)
async def set_team_photo_from_result(
    result_id: int,
    body: SetTeamPhotoRequest,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    _: Annotated[object, Depends(get_staff_with_checkpoint_access)],
) -> SetTeamPhotoResponse:
    """Promote one of a deferred-judging result's submitted photos to the team's official photo.

    Gated by rally_settings.allow_photo_as_team_photo so an admin can turn
    this capability off event-wide. The chosen URL must already be one of
    the result's own media_urls (already stored in R2) to prevent staff
    from pointing a team's photo at an arbitrary URL.
    """
    team_db = await DeferredJudgingService(db).set_team_photo_from_result(
        result_id, image_url=body.image_url
    )
    return SetTeamPhotoResponse(team_id=team_db.id, photo_url=team_db.photo_url)


@router.get(
    "/activities/deferred/pending",
    dependencies=[Depends(deps.get_admin)],
)
async def list_pending_judgments(
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> list[DeferredResultResponse]:
    result = await db.execute(
        select(ActivityResult).where(ActivityResult.judgment_status == "pending_judgment")
    )
    rows = result.scalars().all()
    return [DeferredResultResponse.from_result(r) for r in rows]
