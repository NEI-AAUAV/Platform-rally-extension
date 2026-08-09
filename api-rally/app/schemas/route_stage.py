from pydantic import BaseModel, ConfigDict, Field


class RouteStageBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    order: int = Field(ge=1)
    # Ordered inside the stage, or free choice among its posts.
    order_matters: bool = True
    # How many of the stage's posts must be resolved before the next stage
    # opens. None means all of them. A value larger than the stage's post
    # count is clamped when the rule runs (see route_stages.Stage.required),
    # so a typo cannot strand the route.
    required_count: int | None = Field(default=None, ge=0)


class RouteStageCreate(RouteStageBase): ...


class RouteStageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    order: int | None = Field(default=None, ge=1)
    order_matters: bool | None = None
    required_count: int | None = Field(default=None, ge=0)


class RouteStageResponse(RouteStageBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Ids of the posts currently in this stage, in route order. Read-only:
    # a post's stage is set on the post itself.
    checkpoint_ids: list[int] = []
