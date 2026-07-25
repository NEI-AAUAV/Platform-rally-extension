from pydantic import BaseModel


class TeamMemberAdd(BaseModel):
    name: str
    email: str | None = None
    is_captain: bool = False


class TeamMemberRemove(BaseModel):
    user_id: int


class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: str | None = None
    is_captain: bool = False
    is_linked: bool = False

    class Config:
        from_attributes = True


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    is_captain: bool | None = None


class TeamMemberLink(BaseModel):
    """Link a name-only placeholder member to a real NEI (OIDC) account.

    Identified by the account's Authentik subject. ``name``/``email`` are used to
    populate the local mirror when the account has never logged in yet.
    """

    authentik_sub: str
    name: str | None = None
    email: str | None = None
