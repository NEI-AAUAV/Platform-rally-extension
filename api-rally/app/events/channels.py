"""Redis Pub/Sub channel names for the rally realtime subsystem.

Naming convention: ``rally.{domain}.{action}``.
"""


class Channels:
    """Redis Pub/Sub channel name constants."""

    PREFIX = "rally"

    # Activity-result lifecycle (raw scoring inputs).
    ACTIVITY_RESULT_CREATED = f"{PREFIX}.activity_result.created"
    ACTIVITY_RESULT_UPDATED = f"{PREFIX}.activity_result.updated"
    ACTIVITY_RESULT_DELETED = f"{PREFIX}.activity_result.deleted"

    # Team-level changes that affect the leaderboard.
    TEAM_SCORE_UPDATED = f"{PREFIX}.team.score_updated"
    TEAM_CHECKPOINT_ADVANCED = f"{PREFIX}.team.checkpoint_advanced"

    # Rally lifecycle.
    RALLY_STARTED = f"{PREFIX}.rally.started"
    RALLY_ENDED = f"{PREFIX}.rally.ended"

    # Internal signal: the cached leaderboard was rebuilt (drives the SSE stream).
    LEADERBOARD_REFRESHED = f"{PREFIX}.leaderboard.refreshed"

    # Pattern subscriptions for workers.
    ALL_EVENTS = f"{PREFIX}.*"
    ALL_ACTIVITY_RESULT_EVENTS = f"{PREFIX}.activity_result.*"
    ALL_TEAM_EVENTS = f"{PREFIX}.team.*"
