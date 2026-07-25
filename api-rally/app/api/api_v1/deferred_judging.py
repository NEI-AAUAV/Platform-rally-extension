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

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.abac_deps import get_staff_with_checkpoint_access
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_activity import activity_result as crud_result
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import ActivityResult
from app.schemas.activity_types import ActivityType
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.scoring_service import ScoringService

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

    # Upsert: get existing or create
    existing = await crud_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing:
        existing.media_urls = existing.media_urls + urls
        existing.judgment_status = "pending_judgment"
        existing.is_completed = True
        await db.commit()
        await db.refresh(existing)
        return DeferredResultResponse(
            id=existing.id,
            activity_id=existing.activity_id,
            team_id=existing.team_id,
            judgment_status=existing.judgment_status,
            media_urls=existing.media_urls,
            final_score=existing.final_score,
            is_completed=existing.is_completed,
        )

    result = ActivityResult(
        activity_id=activity_id,
        team_id=team_id,
        result_data={},
        media_urls=urls,
        judgment_status="pending_judgment",
        is_completed=True,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)
    return DeferredResultResponse(
        id=result.id,
        activity_id=result.activity_id,
        team_id=result.team_id,
        judgment_status=result.judgment_status,
        media_urls=result.media_urls,
        final_score=result.final_score,
        is_completed=result.is_completed,
    )


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
    result = await crud_result.get(db, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if result.judgment_status != "pending_judgment":
        raise HTTPException(status_code=400, detail="Result is not pending judgment")

    result.result_data = {"points": body.points, "notes": body.notes or ""}
    result.points_score = int(body.points)
    result.final_score = body.points
    result.judgment_status = "judged"
    result.is_completed = True
    result.completed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(result)

    # Trigger score recalculation
    try:
        await ScoringService(db).update_team_scores(result.team_id)
    except Exception:
        pass

    return DeferredResultResponse(
        id=result.id,
        activity_id=result.activity_id,
        team_id=result.team_id,
        judgment_status=result.judgment_status,
        media_urls=result.media_urls,
        final_score=result.final_score,
        is_completed=result.is_completed,
    )


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
    settings = await rally_settings.get_or_create(db)
    if not settings.allow_photo_as_team_photo:
        raise HTTPException(
            status_code=403,
            detail="Setting a team photo from an activity photo is disabled",
        )

    result = await crud_result.get(db, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if body.image_url not in (result.media_urls or []):
        raise HTTPException(status_code=400, detail="Photo does not belong to this result")

    team_db = await crud.team.set_photo_url(db=db, id=result.team_id, url=body.image_url)
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
    return [
        DeferredResultResponse(
            id=r.id,
            activity_id=r.activity_id,
            team_id=r.team_id,
            judgment_status=r.judgment_status,
            media_urls=r.media_urls or [],
            final_score=r.final_score,
            is_completed=r.is_completed,
        )
        for r in rows
    ]
