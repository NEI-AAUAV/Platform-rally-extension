from pydantic import BaseModel, ConfigDict, Field

# WGS-84 bounds, and the geofence radius floor. Applied to the *write* schemas
# only: response models read whatever is already in the database, and a stricter
# response model would turn a bad legacy row into a 500 on an otherwise fine GET.
LATITUDE_FIELD = Field(default=None, ge=-90, le=90)
LONGITUDE_FIELD = Field(default=None, ge=-180, le=180)


class CheckPointBase(BaseModel):
    name: str
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    order: int
    arrival_radius_m: int = 50
    # Peddy paper riddle whose answer is *this checkpoint's own location*.
    # Deliberately distinct from CheckpointGuideIndication.hint, which a guide
    # reads out to a team that has already arrived. The clue is the one field a
    # redacted checkpoint still carries (see CheckpointService._redact_unreached).
    clue: str | None = None
    # Optional picture-riddle accompanying the clue (R2 URL).
    clue_media_url: str | None = None


class CheckPointCreate(CheckPointBase):
    latitude: float | None = LATITUDE_FIELD
    longitude: float | None = LONGITUDE_FIELD
    # A negative radius silently rejects every GPS check-in with no UI signal.
    arrival_radius_m: int = Field(default=50, ge=0)


class CheckPointUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    latitude: float | None = LATITUDE_FIELD
    longitude: float | None = LONGITUDE_FIELD
    order: int | None = None
    arrival_radius_m: int | None = Field(default=None, ge=0)
    clue: str | None = None
    clue_media_url: str | None = None


class CheckPointResponse(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class DetailedCheckPoint(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
