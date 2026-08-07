from pydantic import BaseModel


class CheckpointSkipped(BaseModel):
    checkpoint_id: int
    # Points charged for giving up (negative, or 0 when free).
    cost: int
    # Where the team goes next; None when they gave up on the last post.
    next_checkpoint_order: int | None = None
