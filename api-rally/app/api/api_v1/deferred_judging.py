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
from app.services.deps import get_deferred_judging_service
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store


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


class DeferredJudgingController:
    """REST controller for deferred-judged activity capture, judging, and listing."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/activities/deferred/{activity_id}/capture",
            self.capture_deferred_result,
            methods=["POST"],
            status_code=201,
            name="capture_deferred_result",
            responses={
                404: {"description": "Activity not found"},
                400: {"description": "Activity is not deferred-judged type, or team_id is missing"},
            },
        )
        self.router.add_api_route(
            "/activities/results/{result_id}/judge",
            self.judge_deferred_result,
            methods=["PUT"],
            name="judge_deferred_result",
            dependencies=[Depends(deps.get_admin)],
            responses={
                404: {"description": "Result not found"},
                400: {"description": "Result is not pending judgment"},
            },
        )
        self.router.add_api_route(
            "/activities/results/{result_id}/set-team-photo",
            self.set_team_photo_from_result,
            methods=["PUT"],
            name="set_team_photo_from_result",
            responses={
                403: {"description": "Setting a team photo from an activity photo is disabled"},
                404: {"description": "Result not found"},
                400: {"description": "Photo does not belong to this result"},
            },
        )
        self.router.add_api_route(
            "/activities/deferred/pending",
            self.list_pending_judgments,
            methods=["GET"],
            name="list_pending_judgments",
            dependencies=[Depends(deps.get_admin)],
        )

    async def capture_deferred_result(
        self,
        activity_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        _: Annotated[object, Depends(get_staff_with_checkpoint_access)],
        service: Annotated[DeferredJudgingService, Depends(get_deferred_judging_service)],
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

        result = await service.capture_result(
            activity_id=activity_id, team_id=team_id, media_urls=urls
        )
        return DeferredResultResponse.from_result(result)

    async def judge_deferred_result(
        self,
        result_id: int,
        body: JudgeRequest,
        service: Annotated[DeferredJudgingService, Depends(get_deferred_judging_service)],
    ) -> DeferredResultResponse:
        result = await service.judge_result(result_id, points=body.points, notes=body.notes)
        return DeferredResultResponse.from_result(result)

    async def set_team_photo_from_result(
        self,
        result_id: int,
        body: SetTeamPhotoRequest,
        _: Annotated[object, Depends(get_staff_with_checkpoint_access)],
        service: Annotated[DeferredJudgingService, Depends(get_deferred_judging_service)],
    ) -> SetTeamPhotoResponse:
        """Promote one of a deferred-judging result's submitted photos to the team's official photo.

        Gated by rally_settings.allow_photo_as_team_photo so an admin can turn
        this capability off event-wide. The chosen URL must already be one of
        the result's own media_urls (already stored in R2) to prevent staff
        from pointing a team's photo at an arbitrary URL.
        """
        team_db = await service.set_team_photo_from_result(result_id, image_url=body.image_url)
        return SetTeamPhotoResponse(team_id=team_db.id, photo_url=team_db.photo_url)

    async def list_pending_judgments(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> list[DeferredResultResponse]:
        result = await db.execute(
            select(ActivityResult).where(ActivityResult.judgment_status == "pending_judgment")
        )
        rows = result.scalars().all()
        return [DeferredResultResponse.from_result(r) for r in rows]


router = DeferredJudgingController().router
