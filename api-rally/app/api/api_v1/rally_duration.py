from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import validate_settings_view_access
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.core.exceptions import RallyNotFoundError, RallyUnauthorizedError
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team
from app.schemas.pace import PaceRanking, TeamPaceEntry
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.pace_service import compute_paces
from app.services.visibility_policy import public_listing_allowed, scores_are_hidden
from app.utils.rally_duration import (
    format_duration,
    get_rally_duration_info,
    get_team_duration_info,
)


class RallyDurationController:
    """REST controller for rally and team duration/timing info."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/rally/duration",
            self.get_rally_duration,
            methods=["GET"],
            status_code=200,
            name="get_rally_duration",
        )
        self.router.add_api_route(
            "/rally/team-duration/{team_id}",
            self.get_team_rally_duration,
            methods=["GET"],
            status_code=200,
            name="get_team_rally_duration",
        )
        self.router.add_api_route(
            "/rally/pace-ranking",
            self.get_pace_ranking,
            methods=["GET"],
            status_code=200,
            name="get_pace_ranking",
            response_model=PaceRanking,
        )

    async def get_rally_duration(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> dict[str, Any]:
        """
        Get rally duration and timing information.

        Returns:
            Rally timing status including current time, start/end times,
            time remaining/elapsed, and progress percentage.
        """
        validate_settings_view_access(curr_user, auth)
        return await get_rally_duration_info(db)

    async def get_team_rally_duration(
        self,
        team_id: int,
        db: Annotated[AsyncSession, Depends(get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> dict[str, Any]:
        """
        Get rally duration information for a specific team.

        Args:
            team_id: ID of the team to get duration info for

        Returns:
            Team-specific rally duration information.
        """
        validate_settings_view_access(curr_user, auth)

        # Get team's first checkpoint time as start time
        team_obj = await team.get(db=db, id=team_id)

        if not team_obj or not team_obj.times:
            raise RallyNotFoundError("Team not found or has no checkpoint times")

        team_start_time = team_obj.times[0]  # First checkpoint time
        return await get_team_duration_info(db, team_start_time)

    async def get_pace_ranking(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)] = None,
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)] = None,
    ) -> PaceRanking:
        """Public scoreboard pace, redacted alongside hidden score standings."""
        if curr_user is None and curr_team is None and not await public_listing_allowed(db):
            raise RallyUnauthorizedError("Authentication required (User or Team Token)")
        settings = await rally_settings.get_or_create(db)
        is_privileged = bool(curr_user) and deps.is_admin_or_staff(getattr(curr_user, "scopes", []))
        hidden = scores_are_hidden(settings, is_privileged=is_privileged)
        teams = {entry.id: entry for entry in await team.get_multi(db)}
        paces = await compute_paces(db, settings)
        event = await team.get_current_event(db)
        return PaceRanking(
            event_id=event.id,
            entries=[
                TeamPaceEntry(
                    id=pace.team_id,
                    name=teams[pace.team_id].name,
                    rank=0 if hidden else pace.rank,
                    elapsed_seconds=None if hidden else pace.elapsed_seconds,
                    elapsed_display=None
                    if hidden
                    else format_duration(
                        timedelta(seconds=pace.elapsed_seconds)
                        if pace.elapsed_seconds is not None
                        else None
                    ),
                    started_at=None if hidden else pace.started_at,
                    last_progress_at=None if hidden else pace.last_progress_at,
                    resolved_count=pace.resolved_count,
                    total_checkpoints=pace.total_published,
                    is_finished=pace.is_finished,
                )
                for pace in paces
            ],
        )


router = RallyDurationController().router
