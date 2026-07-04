from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class CheckpointGuideIndicationBase(BaseModel):
    hint: str = Field(min_length=1)
    question: Optional[str] = None
    expected_answer: Optional[str] = None
    order: int = 0


class CheckpointGuideIndicationCreate(CheckpointGuideIndicationBase):
    ...


class CheckpointGuideIndicationUpdate(BaseModel):
    hint: Optional[str] = Field(default=None, min_length=1)
    question: Optional[str] = None
    expected_answer: Optional[str] = None
    order: Optional[int] = None


class CheckpointGuideIndication(CheckpointGuideIndicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkpoint_id: int
