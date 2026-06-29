from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.checkpoint_media import MediaKind


class CheckpointMediaBase(BaseModel):
    kind: MediaKind
    caption: Optional[str] = None
    order: int = 0


class CheckpointMediaCreate(CheckpointMediaBase):
    pass


class CheckpointMediaUpdate(BaseModel):
    caption: Optional[str] = None
    order: Optional[int] = None


class CheckpointMediaResponse(CheckpointMediaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkpoint_id: int
    image_url: Optional[str] = None
