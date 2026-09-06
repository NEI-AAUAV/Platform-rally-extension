"""Tests for the cross-edition write guard.

``require_same_event`` is reached from every path that writes progress or
points — arrivals, skips, hints, proximity, deferred capture, staff evaluation
— so it is the single place that stops a scan or a token from one edition
scoring a team in another. It had no direct coverage.
"""

import pytest

from app.core.exceptions import RallyNotFoundError
from app.services.event_scope import CHECKPOINT_NOT_FOUND, require_same_event


def test_same_event_is_allowed() -> None:
    require_same_event(1, 1)  # does not raise


def test_different_events_are_rejected() -> None:
    with pytest.raises(RallyNotFoundError) as excinfo:
        require_same_event(1, 2)

    # Not-found, not forbidden: another edition's resource should read as
    # absent rather than have its existence confirmed.
    assert CHECKPOINT_NOT_FOUND in str(excinfo.value)
