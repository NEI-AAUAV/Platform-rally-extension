from fastapi import APIRouter, Depends, HTTPException, status, Security
from sqlalchemy.orm import Session
from sqlalchemy import select
from collections import defaultdict

from app.crud.crud_versus import versus
from app.crud.crud_team import Team
from app.api.deps import get_db, get_participant
from app.api.abac_deps import require_permission, Action, Resource
from app.schemas.versus import (
    VersusPairCreate,
    VersusPairResponse,
    VersusGroupListResponse,
    VersusOpponentResponse
)

from app.api.auth import AuthData, api_nei_auth
from app.schemas.user import DetailedUser

router = APIRouter()

@router.post("/versus/pair", response_model=VersusPairResponse)
def create_versus_pair(
    pair_in: VersusPairCreate,
    db: Session = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
):
    """Create versus pair"""
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.CREATE_VERSUS_GROUP,
        resource=Resource.VERSUS_GROUP
    )

    group_id = versus.create_versus_pair(
        db, team_a_id=pair_in.team_a_id, team_b_id=pair_in.team_b_id
    )

    return VersusPairResponse(
        group_id=group_id,
        team_a_id=pair_in.team_a_id,
        team_b_id=pair_in.team_b_id
    )

@router.get("/versus/team/{team_id}/opponent", response_model=VersusOpponentResponse)
def get_team_opponent(
    team_id: int,
    db: Session = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
):
    """Get a team's opponent"""
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.VIEW_VERSUS_GROUP,
        resource=Resource.VERSUS_GROUP
    )

    opp = versus.get_opponent(db, team_id=team_id)
    
    if opp is None:
        return VersusOpponentResponse(opponent_id=None, opponent_name=None)
    
    return VersusOpponentResponse(
        opponent_id=opp.id,
        opponent_name=opp.name
    )

@router.get("/versus/groups", response_model=VersusGroupListResponse)
def list_versus_groups(
    db: Session = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
):
    """Get all versus groups"""
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.VIEW_VERSUS_GROUP,
        resource=Resource.VERSUS_GROUP
    )

    teams = db.scalars(
        select(Team)
        .where(Team.versus_group_id.isnot(None))
        .order_by(Team.versus_group_id, Team.id)
    ).all()

    groups = defaultdict(list)
    for team in teams:
        groups[team.versus_group_id].append(team)

    pairs = []
    for gid, tl in groups.items():
        if len(tl) == 2:
            pairs.append(
                VersusPairResponse(
                    group_id=gid,
                    team_a_id=tl[0].id,
                    team_b_id=tl[1].id
                )
            )

    return VersusGroupListResponse(groups=pairs)