from pydantic import BaseModel
from typing import Optional


class TeamMemberAdd(BaseModel):
    name: str
    email: Optional[str] = None
    is_captain: bool = False


class TeamMemberRemove(BaseModel):
    user_id: int


class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    is_captain: bool = False
    
    class Config:
        from_attributes = True


class TeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_captain: Optional[bool] = None