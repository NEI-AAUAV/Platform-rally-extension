from fastapi import APIRouter, Depends, Security
from sqlalchemy.orm import Session
from datetime import datetime

from app.schemas.user import DetailedUser
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.api.abac_deps import validate_settings_view_access
from app.utils.rally_duration import get_rally_duration_info, get_team_duration_info

router = APIRouter()


@router.get("/rally/duration", status_code=200)
def get_rally_duration(
    db: Session = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[])
) -> dict:
    """
    Get rally duration and timing information.
    
    Returns:
        Rally timing status including current time, start/end times, 
        time remaining/elapsed, and progress percentage.
    """
    validate_settings_view_access(curr_user, auth)
    return get_rally_duration_info(db)


@router.get("/rally/team-duration/{team_id}", status_code=200)
def get_team_rally_duration(
    team_id: int,
    db: Session = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[])
) -> dict:
    """
    Get rally duration information for a specific team.
    
    Args:
        team_id: ID of the team to get duration info for
        
    Returns:
        Team-specific rally duration information.
    """
    validate_settings_view_access(curr_user, auth)
    
    # Get team's first checkpoint time as start time
    from app.crud.crud_team import team
    team_obj = team.get(db=db, id=team_id)
    
    if not team_obj or not team_obj.times:
        return {"error": "Team not found or has no checkpoint times"}
    
    team_start_time = team_obj.times[0]  # First checkpoint time
    return get_team_duration_info(db, team_start_time)
