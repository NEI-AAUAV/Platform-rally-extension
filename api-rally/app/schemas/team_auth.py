from pydantic import BaseModel


class TeamLoginRequest(BaseModel):
    """Request schema for team login"""
    access_code: str


class TeamLoginResponse(BaseModel):
    """Response schema for team login"""
    access_token: str
    token_type: str = "bearer"
    team_id: int
    team_name: str


class TeamTokenData(BaseModel):
    """Data stored in team JWT token"""
    team_id: int
    team_name: str
