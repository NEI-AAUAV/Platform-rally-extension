from fastapi import APIRouter
from .api_v1 import team
from .api_v1 import checkpoint
from .api_v1 import user
from .api_v1 import rally_settings
from .api_v1 import rally_duration

api_v1_router = APIRouter()

api_v1_router.include_router(team.router, prefix="/team", tags=["Team"])
api_v1_router.include_router(
    checkpoint.router, prefix="/checkpoint", tags=["CheckPoint"]
)
api_v1_router.include_router(user.router, prefix="/user", tags=["User"])
api_v1_router.include_router(rally_settings.router, prefix="", tags=["Settings"])
api_v1_router.include_router(versus.router, prefix="", tags=["Versus"])
api_v1_router.include_router(rally_duration.router, prefix="", tags=["Rally Duration"])