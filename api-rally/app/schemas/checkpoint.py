from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# WGS-84 bounds, and the geofence radius floor. Applied to the *write* schemas
# only: response models read whatever is already in the database, and a stricter
# response model would turn a bad legacy row into a 500 on an otherwise fine GET.
LATITUDE_FIELD = Field(default=None, ge=-90, le=90)
LONGITUDE_FIELD = Field(default=None, ge=-180, le=180)


class CheckPointBase(BaseModel):
    name: str
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    order: int
    arrival_radius_m: int = 50
    # Peddy paper riddle whose answer is *this checkpoint's own location*.
    # Deliberately distinct from CheckpointGuideIndication.hint, which a guide
    # reads out to a team that has already arrived. The clue is the one field a
    # redacted checkpoint still carries (see CheckpointService._redact_unreached).
    clue: str | None = None
    # Optional picture-riddle accompanying the clue (R2 URL).
    clue_media_url: str | None = None
    # Which block of the route this post belongs to (None = no stages).
    stage_id: int | None = None
    # The post's own opening window. Not redacted: a team standing at a closed
    # bar has already solved the riddle, and "opens at 22:00" is the one thing
    # that helps them. None/None means always open.
    available_from: datetime | None = None
    available_until: datetime | None = None


class CheckPointPlanningFields(BaseModel):
    """The staff-only planning columns.

    Kept off ``CheckPointBase`` on purpose: everything the participant sees
    inherits from that base, so a briefing or a challenge description written
    here cannot reach a team by accident. Only ``AdminCheckPoint`` carries
    them back out.
    """

    # Draft posts are excluded from every team-facing query.
    is_draft: bool = False
    # The name is a stand-in ("Bar 1") rather than a decided venue.
    is_placeholder: bool = False
    # What the staff stationed here should talk about.
    staff_script: str | None = None
    # The challenge in prose, before (or instead of) a configured Activity.
    challenge_brief: str | None = None


class CheckPointCreate(CheckPointBase, CheckPointPlanningFields):
    latitude: float | None = LATITUDE_FIELD
    longitude: float | None = LONGITUDE_FIELD
    # A negative radius silently rejects every GPS check-in with no UI signal.
    arrival_radius_m: int = Field(default=50, ge=0)


class CheckPointUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    latitude: float | None = LATITUDE_FIELD
    longitude: float | None = LONGITUDE_FIELD
    order: int | None = None
    arrival_radius_m: int | None = Field(default=None, ge=0)
    clue: str | None = None
    clue_media_url: str | None = None
    stage_id: int | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None
    is_draft: bool | None = None
    is_placeholder: bool | None = None
    staff_script: str | None = None
    challenge_brief: str | None = None


class CheckPointResponse(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class DetailedCheckPoint(CheckPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # True when the team has not reached this checkpoint and the answer-bearing
    # fields were stripped (see CheckpointService._redact_unreached). Clients
    # need to know the difference between "this post has no description" and
    # "you have not earned the description yet" — otherwise they have to sniff
    # the placeholder name to tell them apart.
    is_redacted: bool = False
    # A search circle for a redacted post: wide enough to narrow the city to a
    # neighbourhood, and deliberately NOT centred on the post (see
    # CheckpointService._search_area). All three are None when the event does
    # not use search areas, or the post is already revealed.
    search_latitude: float | None = None
    search_longitude: float | None = None
    search_radius_m: int | None = None


class AdminCheckPoint(DetailedCheckPoint, CheckPointPlanningFields):
    """The admin/staff view of a post: the participant fields plus the
    planning ones and a readiness verdict.

    Returned only by admin-authenticated routes. Teams get
    ``DetailedCheckPoint``, which structurally cannot carry these fields.
    """

    model_config = ConfigDict(from_attributes=True)

    # Field keys still to fill in before this post can run (see
    # app.services.checkpoint_planning.missing_fields). Empty means ready.
    missing: list[str] = []

    @property
    def is_ready(self) -> bool:
        return not self.missing


class RouteStatus(BaseModel):
    """Whether the event's route as a whole is ready to run."""

    published_count: int
    draft_count: int
    # Posts that are published but still incomplete — the ones that will run
    # half-written unless someone fixes them.
    incomplete_published_ids: list[int] = []
    checkpoints: list[AdminCheckPoint] = []
