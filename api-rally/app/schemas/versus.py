from pydantic import BaseModel
from typing import List, Optional

class VersusPairCreate(BaseModel):
    team_a_id: int
    team_b_id: int

class VersusPairResponse(BaseModel):
    group_id: int
    team_a_id: int
    team_b_id: int

class VersusGroupListResponse(BaseModel):
    groups: List[VersusPairResponse]

class VersusOpponentResponse(BaseModel):
    opponent_id: Optional[int]
    opponent_name: Optional[str]