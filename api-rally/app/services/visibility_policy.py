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


def scores_are_hidden(settings: Any, *, is_privileged: bool) -> bool:
    """Whether point totals must be withheld from this caller.

    ``show_score_mode == "hidden"`` is the manager saying the standings are
    secret until the reveal. It has to hold on the wire, not only in the UI:
    the totals, the rank and the per-post breakdown are the whole of what it
    is hiding.
    """
    if is_privileged:
        return False
    return getattr(settings, "show_score_mode", "") == "hidden"
