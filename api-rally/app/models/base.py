import re
from typing import Any

from sqlalchemy.orm import DeclarativeBase, declared_attr

from app.core.config import settings


class Base(DeclarativeBase):
    # Generate __tablename__ automatically
    # SQLAlchemy calls declared_attr.directive methods with the class, so `cls`
    # is the correct (and required) first argument name here.
    @declared_attr.directive
    def __tablename__(cls) -> str:  # noqa: N805
        names = re.findall("[A-Z][^A-Z]*", cls.__name__)
        return "_".join(names).lower()

    __table_args__: Any = ({"schema": settings.SCHEMA_NAME},)
