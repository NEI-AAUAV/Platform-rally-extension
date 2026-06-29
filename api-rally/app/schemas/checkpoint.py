from pydantic import BaseModel, ConfigDict


class CheckPointBase(BaseModel):
    name: str
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    order: int
    arrival_radius_m: int = 50


class CheckPointCreate(CheckPointBase):
    ...


class CheckPointUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    order: int | None = None
    arrival_radius_m: int | None = None


class CheckPointResponse(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class DetailedCheckPoint(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
