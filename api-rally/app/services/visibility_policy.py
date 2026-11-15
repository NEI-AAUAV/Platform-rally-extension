"""Server-side enforcement of the manager's display switches.

``show_live_leaderboard``, ``show_team_details``, ``show_score_mode`` and
``participant_view_enabled`` were read by the SPA and by nothing else: every
endpoint behind them served the same payload whatever they were set to, so
turning one off hid a screen while its data stayed one ``curl`` away. These
helpers are where the switches actually bind.

Privileged callers (admin, manager, staff) are never gated — the switches
control what *participants and the public* see, not whether the people running
the event can see their own data.
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyForbiddenError
from app.crud.crud_rally_settings import rally_settings

LEADERBOARD_HIDDEN = "The live leaderboard is turned off for this event"
TEAM_DETAILS_HIDDEN = "Team details are turned off for this event"
PARTICIPANT_VIEW_DISABLED = "The participant view is turned off for this event"
STANDINGS_PRIVATE = "Each team sees only its own score in this event"

# ``show_score_mode`` values that withhold other teams' standings.
_PRIVATE_SCORE_MODES = frozenset({"hidden", "individual"})


async def public_listing_allowed(db: AsyncSession) -> bool:
    """Whether an unauthenticated caller may read the team directory.

    Two switches, the same pair the public route listing answers to: an event
    that has closed public access serves nobody, and one that has turned the
    live leaderboard off is not publishing standings to passers-by either.
    With both on, the anonymous scoreboard is a feature — the board on the
    wall, the phone of someone who did not enter — so the listing cannot
    simply demand a token.
    """
    settings = await rally_settings.get_or_create(db)
    return bool(settings.public_access_enabled and settings.show_live_leaderboard)


async def require_live_leaderboard(db: AsyncSession, *, is_privileged: bool) -> None:
    """Gate the scoreboard on ``show_live_leaderboard``."""
    if is_privileged:
        return
    settings = await rally_settings.get_or_create(db)
    if not settings.show_live_leaderboard:
        raise RallyForbiddenError(LEADERBOARD_HIDDEN)


async def require_team_details(db: AsyncSession, *, is_privileged: bool) -> None:
    """Gate another team's detail view on ``show_team_details``.

    A team's own page is not gated by this — the switch is about looking at
    *other* teams — so callers pass ``is_privileged=True`` for the self case.
    """
    if is_privileged:
        return
    settings = await rally_settings.get_or_create(db)
    if not settings.show_team_details:
        raise RallyForbiddenError(TEAM_DETAILS_HIDDEN)


async def require_participant_view(db: AsyncSession, *, is_privileged: bool) -> None:
    """Gate the participant-facing screens on ``participant_view_enabled``."""
    if is_privileged:
        return
    settings = await rally_settings.get_or_create(db)
    if not settings.participant_view_enabled:
        raise RallyForbiddenError(PARTICIPANT_VIEW_DISABLED)


def team_scores_hidden(settings: Any, *, is_privileged: bool, is_own_team: bool) -> bool:
    """Whether one team's points and rank must be withheld from this caller.

    ``hidden`` withholds every team's. ``individual`` is "each team sees only
    its own score": the viewer's own team is served in full and every other
    team is redacted — for an anonymous caller that is all of them. The mode
    used to bind in the SPA only, so the full standings stayed one request away.
    """
    if is_privileged:
        return False
    mode = getattr(settings, "show_score_mode", "")
    if mode == "hidden":
        return True
    return mode == "individual" and not is_own_team


async def require_full_standings(db: AsyncSession, *, is_privileged: bool) -> None:
    """Gate the cross-team ranking on ``show_score_mode``.

    Unlike the team directory, the ranking cannot be redacted row by row to
    something useful, so a mode that keeps other teams' scores private closes
    it to non-privileged callers outright.
    """
    if is_privileged:
        return
    settings = await rally_settings.get_or_create(db)
    if getattr(settings, "show_score_mode", "") in _PRIVATE_SCORE_MODES:
        raise RallyForbiddenError(STANDINGS_PRIVATE)
