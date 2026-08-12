"""Constructor-based DI factories for services: one `get_x_service` per service,
wired via FastAPI `Depends` instead of manual `XService(db, ...)` construction
inside controller methods.
"""

from app import crud
from app.api.deps import SessionDep
from app.services.activity_service import ActivityService
from app.services.checkin_service import CheckinService
from app.services.checkpoint_arrival_service import CheckpointArrivalService
from app.services.checkpoint_service import CheckpointService
from app.services.deferred_judging_service import DeferredJudgingService
from app.services.dynamic_scoring_service import DynamicScoringService
from app.services.event_service import EventService
from app.services.export_service import ExportService
from app.services.guide_service import GuideService
from app.services.hint_service import HintService
from app.services.pdf_report_service import PdfReportService
from app.services.profile_service import ProfileService
from app.services.proximity_service import ProximityService
from app.services.rally_settings_service import RallySettingsService
from app.services.scoring_service import ScoringService
from app.services.skip_service import SkipService
from app.services.team_member_service import TeamMemberService
from app.services.team_service import TeamService
from app.services.user_service import UserService


def get_team_service(db: SessionDep) -> TeamService:
    return TeamService(db, crud.team)


def get_checkpoint_service(db: SessionDep) -> CheckpointService:
    return CheckpointService(db, crud.checkpoint, crud.team)


def get_activity_service(db: SessionDep) -> ActivityService:
    return ActivityService(db, crud.activity)


def get_scoring_service(db: SessionDep) -> ScoringService:
    return ScoringService(db)


def get_checkin_service(db: SessionDep) -> CheckinService:
    return CheckinService(db, crud.checkpoint, crud.team)


def get_checkpoint_arrival_service(db: SessionDep) -> CheckpointArrivalService:
    return CheckpointArrivalService(db, crud.checkpoint, crud.team)


def get_hint_service(db: SessionDep) -> HintService:
    return HintService(db, crud.checkpoint, crud.team)


def get_proximity_service(db: SessionDep) -> ProximityService:
    return ProximityService(db, crud.checkpoint, crud.team)


def get_skip_service(db: SessionDep) -> SkipService:
    return SkipService(db, crud.checkpoint, crud.team)


def get_deferred_judging_service(db: SessionDep) -> DeferredJudgingService:
    return DeferredJudgingService(db, crud.team)


def get_dynamic_scoring_service(db: SessionDep) -> DynamicScoringService:
    return DynamicScoringService(db)


def get_event_service(db: SessionDep) -> EventService:
    return EventService(db)


def get_export_service(db: SessionDep) -> ExportService:
    return ExportService(db)


def get_pdf_report_service(db: SessionDep) -> PdfReportService:
    return PdfReportService(db)


def get_guide_service(db: SessionDep) -> GuideService:
    return GuideService(db)


def get_profile_service(db: SessionDep) -> ProfileService:
    return ProfileService(db, crud.team)


def get_rally_settings_service(db: SessionDep) -> RallySettingsService:
    return RallySettingsService(db)


def get_team_member_service(db: SessionDep) -> TeamMemberService:
    return TeamMemberService(db)


def get_user_service(db: SessionDep) -> UserService:
    return UserService(db)
