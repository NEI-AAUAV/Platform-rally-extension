from fastapi import APIRouter
from .api_v1 import team
from .api_v1 import checkpoint
from .api_v1 import user
from .api_v1 import rally_settings
from .api_v1 import versus
from .api_v1 import team_members
from .api_v1 import activities
from .api_v1 import staff_evaluation
from .api_v1 import rally_duration
from .api_v1 import team_auth
from .api_v1 import scoreboard
from .api_v1 import badges
from .api_v1 import checkin
from .api_v1 import events
from .api_v1 import profile
from .api_v1 import checkpoint_media
from .api_v1 import checkpoint_arrive
from .api_v1 import badge_admin

api_v1_router = APIRouter()

api_v1_router.include_router(team.router, prefix="/team", tags=["Team"])
api_v1_router.include_router(
    checkpoint.router, prefix="/checkpoint", tags=["CheckPoint"]
)
api_v1_router.include_router(user.router, prefix="/user", tags=["User"])
api_v1_router.include_router(rally_settings.router, prefix="", tags=["Settings"])
api_v1_router.include_router(versus.router, prefix="", tags=["Versus"])
api_v1_router.include_router(team_members.router, prefix="", tags=["Team Members"])
api_v1_router.include_router(activities.router, prefix="/activities", tags=["Activities"])
api_v1_router.include_router(staff_evaluation.router, prefix="/staff", tags=["Staff Evaluation"])
api_v1_router.include_router(rally_duration.router, prefix="", tags=["Rally Duration"])
api_v1_router.include_router(team_auth.router, prefix="/team-auth", tags=["Team Auth"])
api_v1_router.include_router(scoreboard.router, prefix="", tags=["Scoreboard"])
api_v1_router.include_router(badges.router, prefix="", tags=["Badges"])
api_v1_router.include_router(checkin.router, prefix="", tags=["Check-in"])
api_v1_router.include_router(events.router, prefix="", tags=["Events"])
api_v1_router.include_router(profile.router, prefix="", tags=["Profile"])
api_v1_router.include_router(checkpoint_media.router, prefix="", tags=["Checkpoint Media"])
api_v1_router.include_router(checkpoint_arrive.router, prefix="", tags=["Checkpoint Arrive"])
api_v1_router.include_router(badge_admin.router, prefix="", tags=["Badge Admin"])