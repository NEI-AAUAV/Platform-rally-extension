"""A 404 is routine traffic and must not log at WARNING; other 4xx still do."""

import asyncio

from loguru import logger
from starlette.requests import Request

from app.core.exceptions import RallyForbiddenError, RallyNotFoundError
from app.main import rally_error_handler


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/x", "headers": []})


def _levels_logged(exc: Exception) -> list[str]:
    levels: list[str] = []
    sink_id = logger.add(lambda m: levels.append(m.record["level"].name), level="DEBUG")
    try:
        asyncio.run(rally_error_handler(_request(), exc))  # type: ignore[arg-type]
    finally:
        logger.remove(sink_id)
    return levels


def test_not_found_is_not_a_warning():
    assert "WARNING" not in _levels_logged(RallyNotFoundError("no checkpoint"))


def test_forbidden_is_still_a_warning():
    assert "WARNING" in _levels_logged(RallyForbiddenError("nope"))
