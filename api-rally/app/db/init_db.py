from sqlalchemy.schema import CreateSchema
from sqlalchemy import inspect

from app.core.config import settings
from app.models.base import Base
from .session import engine

# IMPORTANT: Import all models here so they're registered with Base.metadata
# before create_all() is called. Otherwise tables will be missing columns!
from app.models import (  # noqa: F401
    User,
    Team,
    CheckPoint,
    RallyStaffAssignment,
    Activity,
    ActivityResult,
    RallyEvent,
    RallySettings,
)

# For more details: https://github.com/tiangolo/full-stack-fastapi-postgresql/issues/28


def init_db() -> None:
    # For extensions, we use simple table creation since schemas are dropped/created
    # when extensions are disabled/enabled. This is simpler and more appropriate
    # than complex migration management for temporary schemas.

    inspector = inspect(engine)
    all_schemas = inspector.get_schema_names()
    for schema in Base.metadata._schemas:
        if schema not in all_schemas:
            with engine.begin() as connection:
                connection.execute(CreateSchema(schema))  # type: ignore

    Base.metadata.reflect(bind=engine, schema=settings.SCHEMA_NAME)
    Base.metadata.create_all(bind=engine, checkfirst=True)
