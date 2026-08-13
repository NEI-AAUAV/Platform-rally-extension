"""Leg-time scoring: reward or penalize how long a team takes to travel from
their previous checkpoint to the one they just arrived at.

Pure formula, no DB access — mirrors the pattern in ``ranking.py`` and
``route_stages.py``. Wired from ``CheckpointArrivalService`` once a *new*
arrival lands (arrival recording is already idempotent, so this only ever
runs once per team per checkpoint — never on a repeat scan).
"""


def leg_time_points(
    *, leg_minutes: float, target_minutes: float, points_per_minute: float, max_adjustment: float
) -> float:
    """Points for covering a leg in ``leg_minutes`` against a
    ``target_minutes`` expectation.

    Faster than target -> positive (bonus); slower -> negative (penalty).
    Magnitude is capped by ``max_adjustment`` in both directions, so a team
    that stops for dinner between two posts (or whose phone died) can't blow
    up the scoreboard either way.

    Returns 0 when ``points_per_minute`` or ``max_adjustment`` isn't
    positive — the "cost of 0 means off" convention used everywhere else in
    RallySettings, so a feature that's toggled on but not yet priced by the
    admin is inert rather than erroring.
    """
    if points_per_minute <= 0 or max_adjustment <= 0:
        return 0.0
    raw = (target_minutes - leg_minutes) * points_per_minute
    return max(-max_adjustment, min(max_adjustment, raw))
