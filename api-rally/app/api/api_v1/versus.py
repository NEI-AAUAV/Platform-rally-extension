from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import Action, Resource, require_permission
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.crud.crud_versus import versus
from app.schemas.user import DetailedUser
from app.schemas.versus import (
    VersusGroupListResponse,
    VersusOpponentResponse,
    VersusPairCreate,
    VersusPairResponse,
)


class VersusController:
    """REST controller for /versus."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/versus/pair",
            self.create_versus_pair,
            methods=["POST"],
            name="create_versus_pair",
            response_model=VersusPairResponse,
        )
        self.router.add_api_route(
            "/versus/team/{team_id}/opponent",
            self.get_team_opponent,
            methods=["GET"],
            name="get_team_opponent",
            response_model=VersusOpponentResponse,
        )
        self.router.add_api_route(
            "/versus/groups",
            self.list_versus_groups,
            methods=["GET"],
            name="list_versus_groups",
            response_model=VersusGroupListResponse,
        )
        self.router.add_api_route(
            "/versus/groups/{group_id}",
            self.remove_versus_group,
            methods=["DELETE"],
            name="remove_versus_group",
            status_code=204,
        )

    async def create_versus_pair(
        self,
        pair_in: VersusPairCreate,
        db: AsyncSession = Depends(get_db),
        curr_user: DetailedUser = Depends(get_participant),
        auth: AuthData = Security(api_nei_auth, scopes=[]),
    ) -> VersusPairResponse:
        """Create versus pair"""
        require_permission(
            user=curr_user,
            auth=auth,
            action=Action.CREATE_VERSUS_GROUP,
            resource=Resource.VERSUS_GROUP,
        )

        group_id = await versus.create_versus_pair(
            db, team_a_id=pair_in.team_a_id, team_b_id=pair_in.team_b_id
        )

        return VersusPairResponse(
            group_id=group_id, team_a_id=pair_in.team_a_id, team_b_id=pair_in.team_b_id
        )

    async def get_team_opponent(
        self,
        team_id: int,
        db: AsyncSession = Depends(get_db),
        curr_user: DetailedUser = Depends(get_participant),
        auth: AuthData = Security(api_nei_auth, scopes=[]),
    ) -> VersusOpponentResponse:
        """Get a team's opponent"""
        require_permission(
            user=curr_user,
            auth=auth,
            action=Action.VIEW_VERSUS_GROUP,
            resource=Resource.VERSUS_GROUP,
        )

        opp = await versus.get_opponent(db, team_id=team_id)

        if opp is None:
            return VersusOpponentResponse(opponent_id=None, opponent_name=None)

        return VersusOpponentResponse(opponent_id=opp.id, opponent_name=opp.name)

    async def list_versus_groups(
        self,
        db: AsyncSession = Depends(get_db),
        curr_user: DetailedUser = Depends(get_participant),
        auth: AuthData = Security(api_nei_auth, scopes=[]),
    ) -> VersusGroupListResponse:
        """Get all versus groups"""
        require_permission(
            user=curr_user,
            auth=auth,
            action=Action.VIEW_VERSUS_GROUP,
            resource=Resource.VERSUS_GROUP,
        )

        pairs = await versus.get_all_versus_pairs(db)
        return VersusGroupListResponse(
            groups=[
                VersusPairResponse(
                    group_id=pair["group_id"],
                    team_a_id=pair["team_ids"][0],
                    team_b_id=pair["team_ids"][1],
                )
                for pair in pairs
            ]
        )

    async def remove_versus_group(
        self,
        group_id: int,
        db: AsyncSession = Depends(get_db),
        curr_user: DetailedUser = Depends(get_participant),
        auth: AuthData = Security(api_nei_auth, scopes=[]),
    ) -> None:
        require_permission(
            user=curr_user,
            auth=auth,
            action=Action.CREATE_VERSUS_GROUP,
            resource=Resource.VERSUS_GROUP,
        )
        await versus.remove_versus_pair(db, group_id=group_id)


router = VersusController().router
