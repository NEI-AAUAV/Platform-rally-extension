from pydantic import BaseModel, Field


class TeamLoginRequest(BaseModel):
    """Request schema for team login"""

    # Access codes are generated as XXXX-XXXX (uppercase A-Z / 0-9), see
    # crud_team._generate_access_code. Constrain the input to that exact shape
    # so malformed / oversized guesses are rejected before the DB lookup.
    access_code: str = Field(pattern=r"^[A-Z0-9]{4}-[A-Z0-9]{4}$")


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
