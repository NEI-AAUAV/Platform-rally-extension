from pydantic import BaseModel, Field


class ProximityRequest(BaseModel):
    # WGS-84 bounds: an out-of-range fix is a client bug, and Haversine would
    # happily return a plausible-looking distance for it.
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ProximityReading(BaseModel):
    checkpoint_id: int
    # A coarse band ("menos de 500m"), never a metre count — see
    # ProximityService for why.
    band: str
    # Whether a check-in would be accepted from here.
    is_within_radius: bool
    # One of 8 compass sectors, and only inside the closest band. None
    # otherwise, including when the compass is switched off.
    direction: str | None = None
