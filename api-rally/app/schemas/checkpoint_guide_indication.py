from pydantic import BaseModel, ConfigDict, Field


class CheckpointGuideIndicationBase(BaseModel):
    hint: str = Field(min_length=1)
    question: str | None = None
    expected_answer: str | None = None
    order: int = 0


class CheckpointGuideIndicationCreate(CheckpointGuideIndicationBase): ...


class CheckpointGuideIndicationUpdate(BaseModel):
    hint: str | None = Field(default=None, min_length=1)
    question: str | None = None
    expected_answer: str | None = None
    order: int | None = None


class CheckpointGuideIndication(CheckpointGuideIndicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkpoint_id: int
