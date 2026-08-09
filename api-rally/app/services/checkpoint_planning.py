"""Route-planning helpers: readiness of a checkpoint before it can publish.

Pure functions with no database access so they can be unit-tested directly
and reused by the admin API without a service instance.
"""

# Field keys reported as "missing" on a checkpoint that is not ready to be
# published. Kept as plain strings because the frontend maps them to
# translated labels; adding one here is a UI change, not a contract break.
MISSING_NAME = "name"
MISSING_CLUE = "clue"
MISSING_COORDINATES = "coordinates"
MISSING_ACTIVITY = "activity"
MISSING_STAFF = "staff"


def missing_fields(
    checkpoint: object,
    *,
    has_activity: bool,
    has_staff: bool,
    requires_coordinates: bool,
    requires_clue: bool,
) -> list[str]:
    """What a checkpoint still lacks before it can be published.

    ``requires_coordinates`` follows the event's GPS check-in setting: a post
    with no coordinates is perfectly valid in a guided rally and unreachable
    in a self-check-in one. ``requires_clue`` follows redaction: only a route
    whose posts are hidden needs a riddle to find them by.
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
    return missing
