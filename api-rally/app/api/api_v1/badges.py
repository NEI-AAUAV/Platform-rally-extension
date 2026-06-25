"""Team badges: read-only views of awarded badges.

Badges are awarded asynchronously by the badge worker; these endpoints only
read them. Like the scoreboard, they are public-facing.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.badge import TeamBadgeRead
from app.services import badge_service

router = APIRouter()


@router.get("/badges", response_model=list[TeamBadgeRead])
async def list_all_badges(
    *, db: AsyncSession = Depends(get_db)
) -> list[TeamBadgeRead]:
    """Every badge awarded across all teams, newest first."""
    badges = await badge_service.list_all_badges(db)
    return [TeamBadgeRead.model_validate(b) for b in badges]


@router.get("/teams/{team_id}/badges", response_model=list[TeamBadgeRead])
async def list_team_badges(
    team_id: int, *, db: AsyncSession = Depends(get_db)
) -> list[TeamBadgeRead]:
    """All badges a single team holds, newest first."""
    badges = await badge_service.list_team_badges(db, team_id)
    return [TeamBadgeRead.model_validate(b) for b in badges]
