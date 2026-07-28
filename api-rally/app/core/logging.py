"""
Source : https://gist.github.com/nkhitrov/a3e31cfcc1b19cba8e1b626276148c49
Configure handlers and formats for application loggers."""

import logging
import sys
import typing
from collections.abc import Iterator
from contextlib import contextmanager
from pprint import pformat
from types import FrameType
from typing import Any

# if you dont like imports of private modules
# you can move it to typing.py module
from loguru import logger

from app.core.config import settings

# loguru's default format string, duplicated here to avoid importing the
# library's private `loguru._defaults` module.
LOGURU_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
)


class InterceptHandler(logging.Handler):
    """
    Default handler from examples in loguru documentaion.
    See https://loguru.readthedocs.io/en/stable/overview.html#entirely-compatible-with-standard-logging
    """

    def emit(self, record: logging.LogRecord) -> None:
        # Get corresponding Loguru level if it exists
        level: str | int
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame: FrameType | None = logging.currentframe()
        depth = 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def format_record(record: dict[Any, Any]) -> str:
    """
    Custom format for loguru loggers.
    Uses pformat for log any data like request/response body during debug.
    Works with logging if loguru handler it.
    Example:
    >>> payload = [{"users":[{"name": "Nick", "age": 87, "is_active": True}, {"name": "Alex", "age": 27, "is_active": True}], "count": 2}]
    >>> logger.bind(payload=).debug("users payload")
    >>> [   {   'count': 2,
    >>>         'users': [   {'age': 87, 'is_active': True, 'name': 'Nick'},
    >>>                      {'age': 27, 'is_active': True, 'name': 'Alex'}]}]
    """

    format_string: str = typing.cast(str, LOGURU_FORMAT)
    if record["extra"].get("payload") is not None:
        record["extra"]["payload"] = pformat(
            record["extra"]["payload"], indent=4, compact=True, width=88
        )
        format_string += "\n<level>{extra[payload]}</level>"

    format_string += "{exception}\n"
    return format_string


def init_logging() -> None:
    """
    Replaces logging handlers with a handler for using the custom handler.

    WARNING!
    if you call the init_logging in startup event function,
    then the first logs before the application start will be in the old format
    >>> app.add_event_handler("startup", init_logging)
    stdout:
    INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
    INFO:     Started reloader process [11528] using statreload
    INFO:     Started server process [6036]
    INFO:     Waiting for application startup.
    2020-07-25 02:19:21.357 | INFO     | uvicorn.lifespan.on:startup:34 - Application startup complete.
    """
    # disable handlers for specific uvicorn loggers
    # to redirect their output to the default uvicorn logger
    # works with uvicorn==0.11.6
    loggers = (
        logging.getLogger(name)
        for name in logging.root.manager.loggerDict
        if name.startswith("uvicorn.")
    )
    for uvicorn_logger in loggers:
        uvicorn_logger.handlers = []
    logging.getLogger("uvicorn").handlers = []

    # Install the intercept handler on the root logger (not just "uvicorn").
    # Every stdlib `logging.getLogger(__name__)` call site in the app —
    # workers, event publisher, rate limiter, badge evaluators, scoring
    # service, leaderboard cache, check-in — propagates to root. Without this,
    # those modules log against a handler-less root logger at level WARNING:
    # all INFO/DEBUG is silently dropped and WARNING+ falls through to
    # `logging.lastResort` with no timestamp, level, or module name.
    intercept_handler = InterceptHandler()
    logging.root.handlers = [intercept_handler]
    level_log = logging.INFO if settings.PRODUCTION else logging.DEBUG
    logging.root.setLevel(level_log)

    # Silence known-noisy third-party loggers now that they all route through
    # the root handler instead of being dropped by default.
    for noisy in ("uvicorn.access", "httpx", "botocore", "boto3", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logger.configure(
        handlers=[
            typing.cast(
                Any,
                {"sink": sys.stdout, "level": level_log, "format": format_record},
            )
        ]
    )


@contextmanager
def bind_request_context(**kwargs: Any) -> Iterator[None]:
    """Bind fields (e.g. request_id) onto every loguru record emitted within.

    Thin wrapper around ``logger.contextualize`` so call sites don't need to
    import loguru directly. Also covers stdlib ``logging`` call sites bridged
    by ``InterceptHandler``, since they route through the same loguru core.
    """
    with logger.contextualize(**kwargs):
        yield
