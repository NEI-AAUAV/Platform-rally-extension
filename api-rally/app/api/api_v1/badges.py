"""Team badges: read-only views of awarded badges.

Badges are awarded asynchronously by the badge worker; these endpoints only
read them. Like the scoreboard, they are public-facing.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.crud.crud_rally_settings import rally_settings
from app.schemas.badge import (
    BadgeDefinitionLite,
    BadgeShowcaseResponse,
    EarnedBadge,
    TeamBadgeRead,
)
from app.services import badge_service


class BadgesController:
    """REST controller for read-only team badge views."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/badges", self.list_all_badges, methods=["GET"], name="list_all_badges"
        )
        self.router.add_api_route(
            "/teams/{team_id}/badges",
            self.list_team_badges,
            methods=["GET"],
            name="list_team_badges",
        )
        self.router.add_api_route(
            "/teams/{team_id}/badge-showcase",
            self.team_badge_showcase,
            methods=["GET"],
            name="team_badge_showcase",
        )

    async def _badges_enabled(self, db: AsyncSession) -> bool:
        """Whether the badges feature is switched on for the current event."""
        settings = await rally_settings.get_or_create(db)
        return bool(settings.badges_enabled)

    async def list_all_badges(
        self, *, db: Annotated[AsyncSession, Depends(get_db)]
    ) -> list[TeamBadgeRead]:
        """Every badge awarded across all teams, newest first."""
        if not await self._badges_enabled(db):
            return []
        badges = await badge_service.list_all_badges(db)
        return [TeamBadgeRead.model_validate(b) for b in badges]

    async def list_team_badges(
        self, team_id: int, *, db: Annotated[AsyncSession, Depends(get_db)]
    ) -> list[TeamBadgeRead]:
        """All badges a single team holds, newest first."""
        if not await self._badges_enabled(db):
            return []
        badges = await badge_service.list_team_badges(db, team_id)
        return [TeamBadgeRead.model_validate(b) for b in badges]

    async def team_badge_showcase(
        self, team_id: int, *, db: Annotated[AsyncSession, Depends(get_db)]
    ) -> BadgeShowcaseResponse:
        """The full badge board for a team: active catalogue + what it has earned.

        One request drives the locked/earned grid. ``earned`` collapses to the
        earliest award per badge code (a team may hold a code for several scopes).
        When the feature is disabled the board is empty so a direct API hit
        reveals nothing.
        """
        if not await self._badges_enabled(db):
            return BadgeShowcaseResponse(definitions=[], earned=[])
        definitions, awards = await badge_service.get_showcase(db, team_id)

        earliest: dict[str, EarnedBadge] = {}
        for badge in awards:
            prev = earliest.get(badge.badge_type)
            if prev is None or badge.awarded_at < prev.awarded_at:
                earliest[badge.badge_type] = EarnedBadge(
                    code=badge.badge_type,
                    awarded_at=badge.awarded_at,
                    meta=badge.meta or {},
                )

        return BadgeShowcaseResponse(
            definitions=[BadgeDefinitionLite.model_validate(d) for d in definitions],
            earned=list(earliest.values()),
        )


router = BadgesController().router
