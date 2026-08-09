"""Route-planning helpers: readiness of a checkpoint.

Pure function with no database access so it can be unit-tested directly and
reused by the admin API without a service instance.
"""

# Field keys reported as "missing" on a checkpoint that is not ready to be
# published. Kept as plain strings because the frontend maps them to
# translated labels; adding one here is a UI change, not a contract break.
MISSING_NAME = "name"
MISSING_CLUE = "clue"
MISSING_COORDINATES = "coordinates"
MISSING_ACTIVITY = "activity"
MISSING_STAFF = "staff"
MISSING_STAGE = "stage"


def missing_fields(
    checkpoint: object,
    *,
    has_activity: bool,
    has_staff: bool,
    requires_coordinates: bool,
    requires_clue: bool,
    requires_stage: bool = False,
) -> list[str]:
    """What a checkpoint still lacks before it can be published.

    ``requires_coordinates`` follows the event's GPS check-in setting: a post
    with no coordinates is perfectly valid in a guided rally and unreachable
    in a self-check-in one. ``requires_clue`` follows redaction: only a route
    whose posts are hidden needs a riddle to find them by. ``requires_stage``
    follows ``route_stages_enabled``: once an event runs on stages, a post
    with none is invisible to the whole progression rule (see
    ``route_stages.is_reachable_in_stages`` — a checkpoint outside every stage
    falls back to the plain sequential rule, which is easy to mistake for
    "working as intended" when the intent was a staged route).
    """
    missing: list[str] = []
    name = (getattr(checkpoint, "name", "") or "").strip()
    if not name or getattr(checkpoint, "is_placeholder", False):
        missing.append(MISSING_NAME)
    if requires_clue and not (getattr(checkpoint, "clue", None) or "").strip():
        missing.append(MISSING_CLUE)
    if requires_coordinates and (
        getattr(checkpoint, "latitude", None) is None
        or getattr(checkpoint, "longitude", None) is None
    ):
        missing.append(MISSING_COORDINATES)
    if not has_activity:
        missing.append(MISSING_ACTIVITY)
    if not has_staff:
        missing.append(MISSING_STAFF)
    if requires_stage and getattr(checkpoint, "stage_id", None) is None:
        missing.append(MISSING_STAGE)
    return missing
