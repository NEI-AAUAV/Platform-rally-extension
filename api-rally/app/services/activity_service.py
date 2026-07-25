"""Business rules for the activity lifecycle: default-config merging on
create, and ranking DTO normalization. Activity
*scoring* (results, penalties, ranking computation) stays in
ScoringService — this service only owns activity definitions and the
presentation-shaping around them.
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyValidationError
from app.crud.crud_activity import CRUDActivity
from app.models.activity import Activity
from app.models.activity_factory import ActivityFactory
from app.schemas.activity import ActivityCreate, ActivityRanking, TeamRanking


class ActivityService:
    """Activity definition lifecycle and ranking presentation."""

    def __init__(self, db: AsyncSession, activity_crud: CRUDActivity) -> None:
        self._db = db
        self._activity_crud = activity_crud

    async def create_activity(self, activity_in: ActivityCreate) -> Activity:
        """Create an activity, merging the type's default config under
        whatever the caller explicitly provided.

        ``ActivityFactory.get_default_config()`` returns ``{}`` for
        unrecognized types rather than raising, and ``activity_in.activity_type``
        is already validated as an ``ActivityType`` enum member by pydantic —
        so the except below is unreachable in practice; kept as a defensive
        guard.
        """
        try:
            default_config = ActivityFactory.get_default_config(activity_in.activity_type.value)
        except ValueError as e:
            raise RallyValidationError("Invalid activity type") from e

        activity_in.config = {**default_config, **activity_in.config}
        return await self._activity_crud.create(db=self._db, obj_in=activity_in)

    @staticmethod
    def build_activity_ranking(
        *, activity_id: int, activity_name: str, rankings_dict: list[dict[str, Any]]
    ) -> ActivityRanking:
        """Normalize ScoringService's raw ranking dicts into the response DTO."""
        rankings = [
            TeamRanking(
                team_id=r.get("team_id", 0),
                team_name=r.get("team_name", ""),
                total_score=r.get("score", r.get("total_score", 0.0)),
                activities_completed=r.get("activities_completed", 0),
                rank=r.get("rank", 0),
            )
            for r in rankings_dict
        ]
        return ActivityRanking(
            activity_id=activity_id, activity_name=activity_name, rankings=rankings
        )
