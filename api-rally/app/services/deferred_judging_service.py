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
from app.services.event_scope import require_same_event
from app.services.ranking import linear_rank_points
from app.services.scoring_service import ScoringService


class DeferredJudgingService:
    """Capture, judging, and team-photo-promotion lifecycle for deferred-judged results."""

    def __init__(self, db: AsyncSession, team_crud: CRUDTeam) -> None:
        self._db = db
        self._team_crud = team_crud

    async def resolve_team_for_capture(self, *, activity: Activity, team_id: int) -> Team:
        """The team this capture is for, once it is allowed to have one.

        Two things the capture path never asked before. The team has to exist:
        ``ActivityResult.team_id`` is a foreign key, so an unknown id came back
        as an unhandled IntegrityError — a 500 for what is a 404. And it has to
        belong to the same edition as the activity, the guard every other write
        path already applies (``require_same_event``): a capture is scored once
        a judge gets to it, and a scored result resolves the post and moves the
        team's total, so a past-edition team must not acquire one here.

        Public because the controller resolves the team *before* uploading the
        photos — a rejected capture should not leave orphaned objects in R2.
        """
        # CRUDBase.get() raises RallyNotFoundError for a missing id rather than
        # returning None, which is exactly the 404 this path was missing.
        team_obj = await self._team_crud.get(db=self._db, id=team_id)
        if not team_obj:
            raise RallyNotFoundError("Team not found")
        require_same_event(team_obj.event_id, activity.event_id)
        return team_obj

    async def capture_result(
        self, *, activity: Activity, team_id: int, media_urls: list[str]
    ) -> ActivityResult:
        """Upsert a pending-judgment result: append new media to an existing
        capture, or create a fresh one.

        Takes the activity rather than its id: the caller has already loaded it
        to check its type, and the team guard below needs its event.
        """
        await self.resolve_team_for_capture(activity=activity, team_id=team_id)
        activity_id = activity.id
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

        activity = await self._db.get(Activity, result.activity_id)
        result.mark_judged(
            points=points, notes=notes, activity_config=activity.config if activity else None
        )
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
        in.

        The ranking must cover **every** capture for the post, judged ones
        included. The scale is relative: last place means ``min_points``, so
        ranking a subset re-scales that subset across the whole range and
        contradicts whatever the omitted captures already scored. Worse, a
        capture that turns up after a ranking round would be ranked on its own,
        and ``linear_rank_points`` gives a field of one ``max_points`` — a late
        photo scoring top marks by arriving late. ``list_results_for_activity``
        is the query that returns the full field to rank from.

        Every id must also appear once; a duplicate means the ranking was built
        against a stale list.
        """
        if not ordered_result_ids:
            raise RallyValidationError("Ranking must include at least one result")
        if len(set(ordered_result_ids)) != len(ordered_result_ids):
            raise RallyValidationError("Ranking lists the same result more than once")

        activity = await self._db.get(Activity, activity_id)
        if not activity:
            raise RallyNotFoundError("Activity not found")

        # Checked after the activity lookup so an unknown activity is still a
        # 404 rather than a complaint about the list's contents.
        captured_ids = {r.id for r in await self.list_results_for_activity(activity_id)}
        submitted_ids = set(ordered_result_ids)
        foreign = submitted_ids - captured_ids
        if foreign:
            raise RallyValidationError(f"Result {min(foreign)} does not belong to this activity")
        missing = captured_ids - submitted_ids
        if missing:
            raise RallyValidationError(
                f"Ranking must cover all {len(captured_ids)} captures for this "
                f"activity; {len(missing)} missing"
            )

        max_points = float(activity.config.get("max_points", 100))
        min_points = float(activity.config.get("min_points", 0))
        total = len(ordered_result_ids)

        results: list[ActivityResult] = []
        for rank, result_id in enumerate(ordered_result_ids, start=1):
            # Membership was settled by the set comparison above; this only
            # loads the row (and stays defensive about a concurrent delete).
            result = await crud_result.get(self._db, result_id)
            if not result:
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
