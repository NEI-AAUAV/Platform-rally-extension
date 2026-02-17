from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_team import team as crud_team
from app.schemas.team_auth import TeamLoginRequest, TeamLoginResponse, TeamTokenData

router = APIRouter()
security = HTTPBearer()


def create_team_access_token(team_id: int, team_name: str) -> str:
    """Create a JWT token for team authentication"""
    expire = datetime.utcnow() + timedelta(hours=settings.TEAM_TOKEN_EXPIRE_HOURS)
    to_encode = {
        "team_id": team_id,
        "team_name": team_name,
        "exp": expire,
        "type": "team_access"
    }
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.TEAM_JWT_SECRET_KEY, 
        algorithm=settings.TEAM_JWT_ALGORITHM
    )
    return encoded_jwt


def verify_team_token(token: str) -> TeamTokenData:
    """Verify and decode a team JWT token"""
    try:
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        team_id: int = payload.get("team_id")
        team_name: str = payload.get("team_name")
        token_type: str = payload.get("type")
        
        if team_id is None or team_name is None or token_type != "team_access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        
        return TeamTokenData(team_id=team_id, team_name=team_name)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


@router.post("/login", response_model=TeamLoginResponse)
def team_login(
    login_data: TeamLoginRequest,
    db: Session = Depends(deps.get_db)
) -> TeamLoginResponse:
    """
    Authenticate a team using their access code.
    Returns a JWT token for subsequent requests.
    """
    # Find team by access code
    team = crud_team.get_by_access_code(db, access_code=login_data.access_code)
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access code",
        )
    
    # Create access token
    access_token = create_team_access_token(team_id=team.id, team_name=team.name)
    
    return TeamLoginResponse(
        access_token=access_token,
        team_id=team.id,
        team_name=team.name
    )


@router.get("/verify")
def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TeamTokenData:
    """
    Verify a team JWT token.
    Returns the team data if valid.
    """
    token = credentials.credentials
    return verify_team_token(token)


@router.post("/refresh", response_model=TeamLoginResponse)
def refresh_team_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TeamLoginResponse:
    """
    Refresh a team JWT token.
    Takes an existing team token and returns a new one with extended expiration.
    """
    token = credentials.credentials
    team_data = verify_team_token(token)
    
    # Create a new access token with extended expiration
    new_access_token = create_team_access_token(
        team_id=team_data.team_id,
        team_name=team_data.team_name
    )
    
    return TeamLoginResponse(
        access_token=new_access_token,
        team_id=team_data.team_id,
        team_name=team_data.team_name
    )
