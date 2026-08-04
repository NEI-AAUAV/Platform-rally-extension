from fastapi import APIRouter

from app.api.api_v1 import (
    activities,
    audit,
    badge_admin,
    badges,
    checkin,
    checkpoint,
    checkpoint_arrive,
    checkpoint_guide_indication,
    checkpoint_media,
    deferred_judging,
    dynamic_scoring,
    events,
    export,
    guide,
    health,
    profile,
    push,
    rally_duration,
    rally_settings,
    scoreboard,
    staff_evaluation,
    team,
    team_auth,
    team_members,
    user,
    versus,
)

api_v1_router = APIRouter()

api_v1_router.include_router(team.router, prefix="/team", tags=["Team"])
api_v1_router.include_router(checkpoint.router, prefix="/checkpoint", tags=["CheckPoint"])
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
api_v1_router.include_router(
    checkpoint_guide_indication.router, prefix="", tags=["Checkpoint Guide Indications"]
)
api_v1_router.include_router(checkpoint_arrive.router, prefix="", tags=["Checkpoint Arrive"])
api_v1_router.include_router(badge_admin.router, prefix="", tags=["Badge Admin"])
api_v1_router.include_router(deferred_judging.router, prefix="", tags=["Deferred Judging"])
api_v1_router.include_router(dynamic_scoring.router, prefix="", tags=["Dynamic Scoring"])
api_v1_router.include_router(guide.router, prefix="", tags=["Guide"])
api_v1_router.include_router(export.router, prefix="", tags=["Export"])
api_v1_router.include_router(audit.router, prefix="", tags=["Audit"])
api_v1_router.include_router(push.router, prefix="", tags=["Push Notifications"])
api_v1_router.include_router(health.router, prefix="", tags=["health"])
