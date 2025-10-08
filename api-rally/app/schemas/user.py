from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    team_id: Optional[int] = None


class UserCreate(UserBase):
    id: int
    name: str
    email: Optional[str] = None
    password: Optional[str] = None
    scopes: Optional[list[str]] = None
    staff_checkpoint_id: Optional[int] = None


class UserUpdate(UserBase):
    email: Optional[str] = None
    password: Optional[str] = None
    scopes: Optional[list[str]] = None
    staff_checkpoint_id: Optional[int] = None


class ListingUser(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: Optional[str] = None


class DetailedUser(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: Optional[str] = None
    scopes: Optional[list[str]] = None
    disabled: bool
    staff_checkpoint_id: Optional[int] = None
