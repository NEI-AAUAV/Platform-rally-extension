"""Hot/cold proximity for a team hunting a redacted checkpoint.

Rate-limited on purpose. The bands are coarse enough that a handful of
readings leaves a disc rather than a point, but nothing stops a script from
sampling a grid — the limiter is what makes that impractical.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api import deps
from app.api.rate_limit import rate_limit
from app.schemas.proximity import ProximityReading, ProximityRequest
from app.schemas.team_auth import TeamTokenData
from app.services.deps import get_proximity_service
from app.services.proximity_service import ProximityService

# Generous for a team walking around and tapping the button, restrictive for a
# script trying to trilaterate a post it cannot see.
_PROXIMITY_LIMIT = 30
_PROXIMITY_WINDOW_SECONDS = 60


class CheckpointProximityController:
    """REST controller for the team-facing proximity check."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/proximity",
            self.read_proximity,
            methods=["POST"],
            name="read_checkpoint_proximity",
            dependencies=[
                Depends(rate_limit("proximity", _PROXIMITY_LIMIT, _PROXIMITY_WINDOW_SECONDS))
            ],
            responses={
                400: {"description": "Not enabled, not the team's checkpoint, or no coordinates"},
                401: {"description": "Authentication required (Team Token)"},
                404: {"description": "Checkpoint not found"},
                429: {"description": "Too many proximity checks"},
            },
        )

    async def read_proximity(
        self,
        checkpoint_id: int,
        body: ProximityRequest,
        team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
        service: Annotated[ProximityService, Depends(get_proximity_service)],
    ) -> ProximityReading:
        """How close the team is, as a coarse band — never a metre count."""
        return await service.read(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            latitude=body.latitude,
            longitude=body.longitude,
        )


router = CheckpointProximityController().router
