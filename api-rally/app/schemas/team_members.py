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


class TeamMemberLink(BaseModel):
    """Link a name-only placeholder member to a real NEI (OIDC) account.

    Identified by the account's Authentik subject. ``name``/``email`` are used to
    populate the local mirror when the account has never logged in yet.
    """

    authentik_sub: str
    name: Optional[str] = None
    email: Optional[str] = None