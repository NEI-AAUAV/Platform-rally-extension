"""Business rules for deferred-judged activities: capture upsert, judging
lifecycle, and the team-photo promotion gate.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity_result as crud_result
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.activity import Activity, ActivityResult
from app.models.team import Team
from app.services.ranking import linear_rank_points
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
            existing.append_capture(media_urls)
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

        result.mark_judged(points=points, notes=notes)
        await self._db.commit()
        await self._db.refresh(result)

        # Not best-effort: a failed recompute leaves total and classification
        # stale with no way to notice. Surface it.
        await ScoringService(self._db).update_team_scores(result.team_id)

        return result

    async def list_results_for_activity(self, activity_id: int) -> list[ActivityResult]:
        """Every capture for one post — pending and already-judged alike, so
        the judge sees the full field before ranking it, not just what is
        still outstanding."""
        stmt = select(ActivityResult).where(ActivityResult.activity_id == activity_id)
        return list((await self._db.scalars(stmt)).all())

    async def judge_by_ranking(
        self,
        *,
        activity_id: int,
        ordered_result_ids: list[int],
        notes: dict[int, str] | None = None,
    ) -> list[ActivityResult]:
        """Score every capture for one post by where the judge placed it,
        instead of typing a point value per photo.

        1st place gets the activity's configured ``max_points``, the last
        gets ``min_points``, linearly in between (see
        ``ranking.linear_rank_points``) — the same shape a race gets scored
        in. Every id must belong to this activity and appear once; anything
        else means the ranking was built against a stale or wrong list.
        """
        if not ordered_result_ids:
            raise RallyValidationError("Ranking must include at least one result")
        if len(set(ordered_result_ids)) != len(ordered_result_ids):
            raise RallyValidationError("Ranking lists the same result more than once")

        activity = await self._db.get(Activity, activity_id)
        if not activity:
            raise RallyNotFoundError("Activity not found")
        max_points = float(activity.config.get("max_points", 100))
        min_points = float(activity.config.get("min_points", 0))
        total = len(ordered_result_ids)

        results: list[ActivityResult] = []
        for rank, result_id in enumerate(ordered_result_ids, start=1):
            result = await crud_result.get(self._db, result_id)
            if not result or result.activity_id != activity_id:
                raise RallyValidationError(f"Result {result_id} does not belong to this activity")
            points = linear_rank_points(
                rank=rank, total=total, max_points=max_points, min_points=min_points
            )
            result.mark_judged(points=points, notes=(notes or {}).get(result_id))
            results.append(result)

        await self._db.commit()
        for result in results:
            await self._db.refresh(result)

        scoring = ScoringService(self._db)
        for team_id in {r.team_id for r in results}:
            await scoring.update_team_scores(team_id)

        return results

    async def set_team_photo_from_result(self, result_id: int, *, image_url: str) -> Team:
        """Promote one of the result's submitted photos to the team's official photo.

        Gated by rally_settings.allow_photo_as_team_photo so an admin can turn
        this capability off event-wide. The chosen URL must already be one of
        the result's own media_urls (already stored in R2) to prevent staff
        from pointing a team's photo at an arbitrary URL.
        """
        settings = await rally_settings.get_or_create(self._db)
        if not settings.allow_photo_as_team_photo:
            raise RallyForbiddenError("Setting a team photo from an activity photo is disabled")

        result = await crud_result.get(self._db, result_id)
        if not result:
            raise RallyNotFoundError("Result not found")
        if image_url not in (result.media_urls or []):
            raise RallyValidationError("Photo does not belong to this result")

        return await self._team_crud.set_photo_url(db=self._db, id=result.team_id, url=image_url)
