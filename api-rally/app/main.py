from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.db.init_db import init_db
from app.api.api import api_v1_router
from app.core.logging import init_logging
from app.core.config import settings

app = FastAPI(title="Rally Tascas API", default_response_class=ORJSONResponse)
# CORSMiddleware works correctly at runtime, but mypy type stubs for Starlette 0.50 are outdated
app.add_middleware(  # type: ignore[call-arg,arg-type]
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(settings.STATIC_STR, StaticFiles(directory="static"), name="static")
app.add_event_handler("startup", init_logging)
app.add_event_handler("startup", init_db)
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint for monitoring and load balancers"""
    return {
        "status": "healthy",
        "service": "rally-api",
        "version": "1.0.0"
    }


if __name__ == "__main__":
    # Use this for debugging purposes only
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="debug")
