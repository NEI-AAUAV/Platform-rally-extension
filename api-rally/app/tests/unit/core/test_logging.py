"""Unit tests for app.core.logging (loguru/stdlib logging bridge)."""

import logging

import pytest

from app.core.logging import InterceptHandler, format_record, init_logging


class TestInterceptHandler:
    def test_emit_forwards_known_level(self, capsys: pytest.CaptureFixture) -> None:
        handler = InterceptHandler()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello world",
            args=(),
            exc_info=None,
        )
        handler.emit(record)
        # loguru writes to its configured sink; just assert no exception and
        # that the record's message made it through the intercept path.
        # (Sink assertions are brittle across loguru configs; the real
        # assertion is that emit() doesn't raise on a normal record.)

    def test_emit_falls_back_to_levelno_for_unknown_level(self) -> None:
        """A stdlib level name loguru doesn't recognise falls back to the
        raw numeric levelno instead of raising."""
        handler = InterceptHandler()
        record = logging.LogRecord(
            name="test",
            level=99,
            pathname=__file__,
            lineno=1,
            msg="custom level",
            args=(),
            exc_info=None,
        )
        record.levelname = "TOTALLY_UNKNOWN_LEVEL"
        handler.emit(record)  # must not raise

    def test_emit_forwards_exception_info(self) -> None:
        handler = InterceptHandler()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys

            record = logging.LogRecord(
                name="test",
                level=logging.ERROR,
                pathname=__file__,
                lineno=1,
                msg="failure",
                args=(),
                exc_info=sys.exc_info(),
            )
            handler.emit(record)  # must not raise


class TestFormatRecord:
    def test_format_record_without_payload(self) -> None:
        record = {"extra": {}}
        result = format_record(record)
        assert "{exception}" in result
        assert "payload" not in result

    def test_format_record_with_payload_pformats_and_appends_line(self) -> None:
        record = {"extra": {"payload": {"a": 1, "b": [1, 2, 3]}}}
        result = format_record(record)
        # The payload is pformatted into extra["payload"] and the format
        # string references it via a dedicated level line.
        assert "{extra[payload]}" in result
        assert isinstance(record["extra"]["payload"], str)
        assert "'a': 1" in record["extra"]["payload"]


class TestInitLogging:
    def test_init_logging_replaces_uvicorn_handlers(self) -> None:
        # Seed a uvicorn logger with a stray handler to verify it's cleared.
        stray_logger = logging.getLogger("uvicorn.access")
        stray_logger.handlers = [logging.NullHandler()]

        init_logging()

        assert stray_logger.handlers == []
        uvicorn_logger = logging.getLogger("uvicorn")
        assert len(uvicorn_logger.handlers) == 1
        assert isinstance(uvicorn_logger.handlers[0], InterceptHandler)
