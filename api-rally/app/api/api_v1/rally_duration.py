from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import validate_settings_view_access
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.core.exceptions import RallyNotFoundError
from app.crud.crud_team import team
from app.schemas.user import DetailedUser
from app.utils.rally_duration import get_rally_duration_info, get_team_duration_info


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


router = RallyDurationController().router
