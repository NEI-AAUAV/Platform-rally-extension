from pydantic import BaseModel, ConfigDict

from app.models.checkpoint_media import MediaKind


class CheckpointMediaBase(BaseModel):
    kind: MediaKind
    caption: str | None = None
    order: int = 0


class CheckpointMediaCreate(CheckpointMediaBase):
    pass


class CheckpointMediaUpdate(BaseModel):
    caption: str | None = None
    order: int | None = None


class CheckpointMediaResponse(CheckpointMediaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkpoint_id: int
    image_url: str | None = None
