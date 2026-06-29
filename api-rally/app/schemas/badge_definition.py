from typing import Optional
from pydantic import BaseModel, ConfigDict


class BadgeDefinitionBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_auto: bool = False


class BadgeDefinitionCreate(BadgeDefinitionBase):
    code: str


class BadgeDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class BadgeDefinitionResponse(BadgeDefinitionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    icon_url: Optional[str] = None


class ManualBadgeAwardCreate(BaseModel):
    team_id: int
    badge_code: str
    activity_id: Optional[int] = None
    checkpoint_id: Optional[int] = None
