from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import ListingUser


class TeamBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total: int
    classification: int
    versus_group_id: int | None = None
    photo_url: str = ""
    # Minutes after the event's start time that this team is allowed to set
    # off. 0 (the default) means it starts with everyone else.
    start_offset_minutes: int = 0


class RouteProgressFields(BaseModel):
    """The team's position on the route, as the server computes it.

    The sets exist because ``current_checkpoint_number`` alone cannot describe
    a free-order or staged route: several posts are open at once, and resolved
    posts need not form a prefix. Clients must render "concluído"/"pendente"
    from ``resolved_checkpoint_orders`` and the finished state from
    ``is_route_finished`` rather than re-deriving either from a count — that
    arithmetic is what made the participant screen and the team page disagree.
    """

    # Activity-based completion counters (more reliable than len(times))
    last_checkpoint_number: int | None = None
    current_checkpoint_number: int | None = None
    resolved_checkpoint_orders: list[int] = []
    open_checkpoint_orders: list[int] = []
    is_route_finished: bool = False
    started_at: datetime | None = None
    elapsed_seconds: float | None = None
    finished_at: datetime | None = None


class ListingTeam(TeamBase, RouteProgressFields):
    """
    The schema returned when listing multiple teams
    """

    num_members: int
    times: list[datetime] = []

    last_checkpoint_time: datetime | None
    last_checkpoint_score: int | None = None
    last_checkpoint_name: str | None = None


class CheckpointPenalties(BaseModel):
    """Points a team lost at one post, broken down by cause.

    ``hints_cost`` is what the team paid unlocking guide indications there,
    ``skip_cost`` the give-up penalty, ``activity_penalties`` the sum of the
    activity-level deductions (vómitos, não-beber, contadores dinâmicos).
    Every field is negative or zero, the same sign convention as the rest of
    the app. Only posts with at least one non-zero penalty are emitted, keyed
    by ``checkpoint_order`` so a client can line them up with
    ``score_per_checkpoint[order - 1]``.
    """

    model_config = ConfigDict(from_attributes=True)

    checkpoint_order: int
    checkpoint_id: int
    hints_cost: int = 0
    skip_cost: int = 0
    activity_penalties: int = 0
    total: int = 0


class DetailedTeam(TeamBase, RouteProgressFields):
    times: list[datetime]

    score_per_checkpoint: list[int]

    members: list[ListingUser]

    total_checkpoints: int | None = None

    # Per-post penalty breakdown. Empty when the team lost no points to
    # hints/give-ups/activity penalties, or when scores are hidden.
    penalties_per_checkpoint: list[CheckpointPenalties] = []


class PrivilegedDetailedTeam(DetailedTeam):
    """DetailedTeam plus the team's access code.

    The access code is the sole authentication factor for team login, so it is
    only ever exposed to the team itself or to admin/staff-scoped callers.
    It is None whenever the caller is not entitled to see it.
    """

    access_code: str | None = None


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str | None = None
    # Admin-only endpoint. Changing this credential revokes all issued team
    # JWTs in CRUDTeam.update.
    access_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{4}-[A-Z0-9]{4}$")
    start_offset_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    times: list[datetime] | None = None
    score_per_checkpoint: list[int] | None = None
    question_scores: list[bool] | None = None
    time_scores: list[int] | None = None
    pukes: int | None = None
    skips: int | None = None


class AdminCheckPointSelect(BaseModel):
    # For admin's only
    checkpoint_id: int | None = None


class TeamScoresUpdate(AdminCheckPointSelect):
    question_score: int
    time_score: int
    pukes: int
    skips: int
