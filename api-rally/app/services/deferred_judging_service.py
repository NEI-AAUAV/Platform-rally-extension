"""Business rules for deferred-judged activities: capture upsert, judging
lifecycle, and the team-photo promotion gate.
"""

import contextlib
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity_result as crud_result
from app.crud.crud_team import CRUDTeam
from app.models.activity import ActivityResult
from app.models.team import Team
from app.services.scoring_service import ScoringService


class DeferredJudgingService:
    """Capture, judging, and team-photo-promotion lifecycle for deferred-judged results."""

    def __init__(self, db: AsyncSession, team_crud: CRUDTeam) -> None:
        self._db = db
        self._team_crud = team_crud

    async def capture_result(
        self, *, activity_id: int, team_id: int, media_urls: list[str]
    ) -> ActivityResult:
        """Upsert a pending-judgment result: append new media to an existing
        capture, or create a fresh one."""
        existing = await crud_result.get_by_activity_and_team(self._db, activity_id, team_id)
        if existing:
            existing.media_urls = existing.media_urls + media_urls
            existing.judgment_status = "pending_judgment"
            existing.is_completed = True
            await self._db.commit()
            await self._db.refresh(existing)
            return existing

        result = ActivityResult(
            activity_id=activity_id,
            team_id=team_id,
            result_data={},
            media_urls=media_urls,
            judgment_status="pending_judgment",
            is_completed=True,
        )
        self._db.add(result)
        await self._db.commit()
        await self._db.refresh(result)
        return result

    async def judge_result(
        self, result_id: int, *, points: float, notes: str | None
    ) -> ActivityResult:
        """Score a pending-judgment result and recompute the team's total.

        Score recalculation failure is logged (by ScoringService) but never
        fails the judging request
        """
        result = await crud_result.get(self._db, result_id)
        if not result:
            raise RallyNotFoundError("Result not found")
        if result.judgment_status != "pending_judgment":
            raise RallyValidationError("Result is not pending judgment")

        result.result_data = {"points": points, "notes": notes or ""}
        result.points_score = int(points)
        result.final_score = points
        result.judgment_status = "judged"
        result.is_completed = True
        result.completed_at = datetime.now(UTC)
        await self._db.commit()
        await self._db.refresh(result)

        with contextlib.suppress(Exception):  # score recalc is best-effort here
            await ScoringService(self._db).update_team_scores(result.team_id)

        return result

    async def set_team_photo_from_result(self, result_id: int, *, image_url: str) -> Team:
        """Promote one of the result's submitted photos to the team's official photo.

        Gated by rally_settings.allow_photo_as_team_photo so an admin can turn
        this capability off event-wide. The chosen URL must already be one of
        the result's own media_urls (already stored in R2) to prevent staff
        from pointing a team's photo at an arbitrary URL.
        """
        from app.crud.crud_rally_settings import rally_settings

        settings = await rally_settings.get_or_create(self._db)
        if not settings.allow_photo_as_team_photo:
            raise RallyForbiddenError("Setting a team photo from an activity photo is disabled")

        result = await crud_result.get(self._db, result_id)
        if not result:
            raise RallyNotFoundError("Result not found")
        if image_url not in (result.media_urls or []):
            raise RallyValidationError("Photo does not belong to this result")

        return await self._team_crud.set_photo_url(db=self._db, id=result.team_id, url=image_url)
