from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


class UserBase(BaseModel):
    name: str | None = None
    team_id: int | None = None
    is_captain: bool | None = False


class UserCreate(UserBase):
    name: str
    email: str | None = None
    staff_checkpoint_id: int | None = None


class UserUpdate(UserBase):
    staff_checkpoint_id: int | None = None


class ListingUser(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    # True once this member has linked a real NEI (OIDC) account. Derived
    # from authentik_sub on the underlying User row; the sub itself is never
    # exposed here.
    is_linked: bool = False

    @model_validator(mode="before")
    @classmethod
    def _derive_is_linked(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "name": data.name,
            "team_id": data.team_id,
            "is_captain": data.is_captain,
            "is_linked": getattr(data, "authentik_sub", None) is not None,
        }


class DetailedUser(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    disabled: bool
    staff_checkpoint_id: int | None = None
    guide_checkpoint_id: int | None = None
    scopes: list[str] | None = []
