"""Covers __repr__ methods on models with no dedicated test file."""

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.evaluation_history import EvaluationHistory
from app.models.idempotency_key import IdempotencyKey


def test_activity_repr():
    activity = Activity(id=1, name="Quiz", activity_type="GeneralActivity")
    text = repr(activity)
    assert "Activity" in text
    assert "id=1" in text
    assert "name='Quiz'" in text
    assert "type='GeneralActivity'" in text


def test_activity_result_repr():
    result = ActivityResult(id=1, activity_id=2, team_id=3)
    text = repr(result)
    assert "ActivityResult" in text
    assert "activity_id=2" in text
    assert "team_id=3" in text


def test_rally_event_repr():
    event = RallyEvent(id=1, name="Rally 2026", is_current=True)
    text = repr(event)
    assert "RallyEvent" in text
    assert "name='Rally 2026'" in text
    assert "current=True" in text


def test_evaluation_history_repr():
    entry = EvaluationHistory(id=1, result_id=2, action="EDITED")
    text = repr(entry)
    assert "EvaluationHistory" in text
    assert "id=1" in text
    assert "result_id=2" in text
    assert "action='EDITED'" in text


def test_idempotency_key_repr():
    key = IdempotencyKey(endpoint="evaluate", idempotency_key="abc-123")
    text = repr(key)
    assert "IdempotencyKey" in text
    assert "endpoint='evaluate'" in text
    assert "key='abc-123'" in text
