from typing import TYPE_CHECKING
from app.crud.base import CRUDBase
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import RallySettingsUpdate

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

class CRUDRallySettings(CRUDBase[RallySettings, RallySettingsUpdate, RallySettingsUpdate]):
    async def get_or_create(self, db: "AsyncSession") -> RallySettings:
        settings = await db.get(RallySettings, 1)

        if not settings:
            settings = RallySettings(
                id=1,
                # Team management
                max_teams=14,
                max_members_per_team=10,
                enable_versus=True,
                # Rally timing
                rally_start_time=None,
                rally_end_time=None,
                # Scoring system
                penalty_per_puke=-10,
                penalty_per_not_drinking=-2,
                bonus_per_extra_shot=1,
                max_extra_shots_per_member=5,
                # Checkpoint behavior
                checkpoint_order_matters=True,
                # Staff and scoring
                enable_staff_scoring=True,
                # Display settings
                show_live_leaderboard=True,
                show_team_details=True,
                show_checkpoint_map=True,
                participant_view_enabled=False,
                show_route_mode="focused",
                show_score_mode="hidden",
                # Rally customization
                rally_theme="Rally Tascas - Competição de Equipas",
                # Access control
                public_access_enabled=True
            )
            db.add(settings)
            await db.commit()
            await db.refresh(settings)

        return settings

rally_settings = CRUDRallySettings(RallySettings)
