from pydantic import BaseModel


class VersusPairCreate(BaseModel):
    team_a_id: int
    team_b_id: int


class VersusPairResponse(BaseModel):
    group_id: int
    team_a_id: int
    team_b_id: int


class VersusGroupListResponse(BaseModel):
    groups: list[VersusPairResponse]


class VersusOpponentResponse(BaseModel):
    opponent_id: int | None
    opponent_name: str | None
