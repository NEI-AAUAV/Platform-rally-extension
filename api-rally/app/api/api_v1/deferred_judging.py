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
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import require_checkpoint_management_permission
from app.crud.crud_activity import activity_result as crud_result, activity as crud_activity
from app.models.activity import ActivityResult
from app.schemas.activity_types import ActivityType
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.scoring_service import ScoringService

router = APIRouter()


class JudgeRequest(BaseModel):
    points: float
    notes: Optional[str] = None


class DeferredResultResponse(BaseModel):
    id: int
    activity_id: int
    team_id: int
    judgment_status: Optional[str]
    media_urls: List[str]
    final_score: Optional[float]
    is_completed: bool


@router.post(
    "/activities/deferred/{activity_id}/capture",
    response_model=DeferredResultResponse,
    status_code=201,
)
async def capture_deferred_result(
    activity_id: int,
    images: List[UploadFile] = File(default=[]),
    team_id: int = 0,
    db: AsyncSession = Depends(deps.get_db),
    _: None = Depends(require_checkpoint_management_permission),
) -> DeferredResultResponse:
    activity = await crud_activity.get(db, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.activity_type != ActivityType.DEFERRED_JUDGED.value:
        raise HTTPException(status_code=400, detail="Activity is not deferred-judged type")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")

    # Upload images
    urls: List[str] = []
    for image in images:
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
        is_completed=False,
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
    response_model=DeferredResultResponse,
    dependencies=[Depends(deps.get_admin)],
)
async def judge_deferred_result(
    result_id: int,
    body: JudgeRequest,
    db: AsyncSession = Depends(deps.get_db),
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
    result.completed_at = datetime.now(timezone.utc)
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


@router.get(
    "/activities/deferred/pending",
    response_model=List[DeferredResultResponse],
    dependencies=[Depends(deps.get_admin)],
)
async def list_pending_judgments(
    db: AsyncSession = Depends(deps.get_db),
) -> List[DeferredResultResponse]:
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
