from app.crud.base import CRUDBase
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import RallySettingsUpdate

class CRUDRallySettings(CRUDBase[RallySettings, RallySettingsUpdate, RallySettingsUpdate]):
    def get_or_create(self, db):
        settings = db.get(RallySettings, 1)

        if not settings:
            settings = RallySettings(id=1, max_teams=16, enable_versus=False)
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return settings
    
rally_settings = CRUDRallySettings(RallySettings)