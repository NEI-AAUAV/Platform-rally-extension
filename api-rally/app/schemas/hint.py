from datetime import datetime

from pydantic import BaseModel, ConfigDict

# Note what is *absent* from every model here: a guide indication also carries
# `question` and `expected_answer`, which stay guide-only. A team route never
# returns them.


class RevealedHint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    indication_id: int
    hint: str
    # Points charged at the moment of purchase (negative, or 0 when free).
    cost: int
    revealed_at: datetime


class TeamHints(BaseModel):
    checkpoint_id: int
    revealed: list[RevealedHint]
    remaining: int
    # What the next hint would cost at the current setting.
    next_cost: int


class TeamHintSummary(BaseModel):
    """Every hint this team has bought, across the whole event.

    The per-checkpoint listing only covers the post the team is looking at, so
    without this a team that spent points at three posts has no way to add
    them up — the DynamicAward rows carrying the charges are admin-only.
    """

    revealed: list[RevealedHint]
    total_spent: int


class HintReveal(BaseModel):
    checkpoint_id: int
    indication_id: int
    hint: str
    cost: int
    remaining: int
