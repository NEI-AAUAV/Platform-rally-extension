from app.crud.base import CRUDBase
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import RallySettingsUpdate

class CRUDRallySettings(CRUDBase[RallySettings, RallySettingsUpdate, RallySettingsUpdate]):
    def get_or_create(self, db):
        settings = db.get(RallySettings, 1)

        if not settings:
            settings = RallySettings(
                id=1,
                # Team management
                max_teams=16,
                enable_versus=False,
                # Rally timing
                rally_start_time=None,
                rally_end_time=None,
                # Scoring system
                penalty_per_puke=-5,
                # Checkpoint behavior
                checkpoint_order_matters=True,
                # Staff and scoring
                enable_staff_scoring=True,
                # Display settings
                show_live_leaderboard=True,
                show_team_details=True,
                show_checkpoint_map=True,
                # Rally customization
                rally_theme="Rally Tascas"
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return settings
    
rally_settings = CRUDRallySettings(RallySettings)