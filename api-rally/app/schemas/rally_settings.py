from pydantic import BaseModel, ConfigDict

class RallySettingsBase(BaseModel):
    max_teams: int
    enable_versus: bool

class RallySettingsUpdate(RallySettingsBase):
    pass

class RallySettingsResponse(RallySettingsBase):
    model_config = ConfigDict(from_attributes=True)