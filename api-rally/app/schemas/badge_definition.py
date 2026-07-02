import re
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.badges.triggers import BadgeTrigger
from app.models.badge_definition import DEFAULT_BADGE_COLOR

_CODE_RE = re.compile(r"^[a-z0-9_]+$")
_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def _validate_trigger(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    try:
        BadgeTrigger(value)
    except ValueError:
        raise ValueError(f"invalid trigger_type: {value!r}")
    return value


def _validate_color(value: str) -> str:
    if not _HEX_RE.match(value):
        raise ValueError("color must be a hex string like #8b5cf6")
    return value


class BadgeDefinitionBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_auto: bool = False
    color: str = DEFAULT_BADGE_COLOR
    glyph: Optional[str] = None
    trigger_type: Optional[str] = None
    criteria: dict[str, Any] = {}

    _check_trigger = field_validator("trigger_type")(_validate_trigger)
    _check_color = field_validator("color")(_validate_color)


class BadgeDefinitionCreate(BadgeDefinitionBase):
    code: str

    @field_validator("code")
    @classmethod
    def _check_code(cls, value: str) -> str:
        value = value.strip().lower()
        if not _CODE_RE.match(value):
            raise ValueError("code must match ^[a-z0-9_]+$")
        return value


class BadgeDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_auto: Optional[bool] = None
    color: Optional[str] = None
    glyph: Optional[str] = None
    trigger_type: Optional[str] = None
    criteria: Optional[dict[str, Any]] = None

    @field_validator("trigger_type")
    @classmethod
    def _check_trigger(cls, value: Optional[str]) -> Optional[str]:
        return _validate_trigger(value)

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _validate_color(value)


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
