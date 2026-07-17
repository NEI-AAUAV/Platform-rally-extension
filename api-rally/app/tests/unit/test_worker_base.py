"""Unit tests for BaseWorker: dispatch, lifecycle (start/stop), signal handling."""
import json
import signal
import time
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.workers import base
from app.workers.base import BaseWorker


class _RecordingWorker(BaseWorker):
    channels = ["test.chan"]

    def __init__(self) -> None:
        super().__init__()
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        self.events.append((channel, data))


class _RaisingWorker(BaseWorker):
    channels = ["test.chan"]

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        raise RuntimeError("handler exploded")


def test_name_returns_class_name() -> None:
    worker = _RecordingWorker()
    assert worker.name == "_RecordingWorker"


class TestDispatch:
    def test_ignores_non_message_types(self) -> None:
        worker = _RecordingWorker()
        worker._dispatch({"type": "subscribe"})
        assert worker.events == []

    def test_dispatches_message_with_json_string_data(self) -> None:
        worker = _RecordingWorker()
        worker._dispatch(
            {"type": "message", "channel": "test.chan", "data": json.dumps({"a": 1})}
        )
        assert worker.events == [("test.chan", {"a": 1})]

    def test_dispatches_pmessage_using_pattern_as_channel_fallback(self) -> None:
        worker = _RecordingWorker()
        worker._dispatch(
            {"type": "pmessage", "pattern": "test.*", "data": json.dumps({"b": 2})}
        )
        assert worker.events == [("test.*", {"b": 2})]

    def test_passes_through_non_string_data_unchanged(self) -> None:
        worker = _RecordingWorker()
        worker._dispatch({"type": "message", "channel": "test.chan", "data": {"c": 3}})
        assert worker.events == [("test.chan", {"c": 3})]

    def test_logs_and_continues_on_bad_json(self) -> None:
        worker = _RecordingWorker()
        worker._dispatch({"type": "message", "channel": "test.chan", "data": "{not json"})
        assert worker.events == []

    def test_logs_and_continues_when_handler_raises(self) -> None:
        worker = _RaisingWorker()
        # Must not propagate — a bad event must not kill the worker.
        worker._dispatch({"type": "message", "channel": "test.chan", "data": "{}"})


class TestStartStop:
    def test_start_noop_when_events_disabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(base.settings, "EVENTS_ENABLED", False)
        worker = _RecordingWorker()
        worker.start(background=True)
        assert worker._running is False
        assert worker._thread is None

    def test_start_noop_when_already_running(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(base.settings, "EVENTS_ENABLED", True)
        worker = _RecordingWorker()
        worker._running = True
        with patch.object(worker, "_run_loop") as mock_run_loop:
            worker.start(background=False)
        mock_run_loop.assert_not_called()

    def test_start_background_spawns_daemon_thread(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(base.settings, "EVENTS_ENABLED", True)
        worker = _RecordingWorker()
        with patch.object(worker, "_run_loop") as mock_run_loop:
            worker.start(background=True)
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline and not mock_run_loop.called:
                time.sleep(0.01)

        assert worker._running is True
        assert worker._thread is not None
        assert worker._thread.daemon is True
        worker._thread.join(timeout=2.0)

    def test_start_foreground_registers_signal_handlers_and_runs_inline(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(base.settings, "EVENTS_ENABLED", True)
        worker = _RecordingWorker()
        with patch.object(worker, "_run_loop") as mock_run_loop, patch(
            "app.workers.base.signal.signal"
        ) as mock_signal:
            worker.start(background=False)

        mock_run_loop.assert_called_once()
        signals_registered = {call.args[0] for call in mock_signal.call_args_list}
        assert signals_registered == {signal.SIGINT, signal.SIGTERM}

    def test_stop_noop_when_not_running(self) -> None:
        worker = _RecordingWorker()
        worker.stop()  # should not raise
        assert worker._running is False

    def test_stop_joins_thread_and_resets_state(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(base.settings, "EVENTS_ENABLED", True)
        worker = _RecordingWorker()
        with patch.object(worker, "_run_loop"):
            worker.start(background=True)
        worker._last_beat = time.monotonic()

        worker.stop(timeout=1.0)

        assert worker._running is False
        assert worker._last_beat == pytest.approx(0.0)

    def test_last_beat_property_reflects_internal_state(self) -> None:
        worker = _RecordingWorker()
        assert worker.last_beat == pytest.approx(0.0)

        now = time.monotonic()
        worker._last_beat = now
        assert worker.last_beat == pytest.approx(now)

    def test_signal_handler_calls_stop(self) -> None:
        worker = _RecordingWorker()
        with patch.object(worker, "stop") as mock_stop:
            worker._signal_handler(signal.SIGTERM, None)
        mock_stop.assert_called_once()


class TestConsume:
    def test_consume_subscribes_channels_and_patterns_then_dispatches(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class _PatternedWorker(_RecordingWorker):
            patterns = ["test.*"]

        worker = _PatternedWorker()
        messages = [
            {"type": "message", "channel": "test.chan", "data": json.dumps({"n": 1})},
            None,
        ]

        fake_pubsub = MagicMock()
        fake_pubsub.get_message.side_effect = lambda timeout=1.0: (
            messages.pop(0) if messages else worker._stop_event.set()
        )

        fake_client = MagicMock()
        fake_client.pubsub.return_value = fake_pubsub
        monkeypatch.setattr(base, "get_redis_client", lambda: fake_client)

        worker._consume()

        fake_pubsub.subscribe.assert_called_once_with("test.chan")
        fake_pubsub.psubscribe.assert_called_once_with("test.*")
        fake_pubsub.close.assert_called_once()
        assert worker.events == [("test.chan", {"n": 1})]
