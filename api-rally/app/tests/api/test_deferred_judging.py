"""Tests for deferred-judged activity endpoints (B3)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_admin
from app.api.abac_deps import (
    get_staff_with_checkpoint_access,
    require_checkpoint_management_permission,
)
from app.models.activity import ActivityResult
from app.schemas.activity_types import ActivityType


def _activity(activity_type: str = ActivityType.DEFERRED_JUDGED.value) -> Mock:
    a = Mock()
    a.id = 1
    a.activity_type = activity_type
    return a


def _result(
    id: int = 1,
    judgment_status: str = "pending_judgment",
    media_urls: list | None = None,
    final_score: float | None = None,
    is_completed: bool = False,
) -> Mock:
    r = Mock(spec=ActivityResult)
    r.id = id
    r.activity_id = 1
    r.team_id = 2
    r.judgment_status = judgment_status
    r.media_urls = media_urls or []
    r.final_score = final_score
    r.is_completed = is_completed
    r.result_data = {}
    r.points_score = None
    r.completed_at = None
    return r


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def staff_client() -> TestClient:
    app.dependency_overrides[require_checkpoint_management_permission] = lambda: None
    app.dependency_overrides[get_admin] = lambda: None
    app.dependency_overrides[get_staff_with_checkpoint_access] = lambda: None
    return TestClient(app)


# ---------- capture ----------

def test_capture_deferred_result_no_images(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    r = _result()
    db_mock.add = Mock()
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock(side_effect=lambda obj: None)

    with patch("app.api.api_v1.deferred_judging.crud_activity.get", new=AsyncMock(return_value=_activity())), \
         patch("app.api.api_v1.deferred_judging.crud_result.get_by_activity_and_team", new=AsyncMock(return_value=None)), \
         patch("app.api.api_v1.deferred_judging.ActivityResult", return_value=r):
        resp = staff_client.post(
            "/api/rally/v1/activities/deferred/1/capture?team_id=2",
        )
    assert resp.status_code == 201


def test_capture_wrong_activity_type(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.api.api_v1.deferred_judging.crud_activity.get", new=AsyncMock(return_value=_activity(ActivityType.BOOLEAN.value))):
        resp = staff_client.post(
            "/api/rally/v1/activities/deferred/1/capture?team_id=2",
        )
    assert resp.status_code == 400


def test_capture_activity_not_found(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.api.api_v1.deferred_judging.crud_activity.get", new=AsyncMock(return_value=None)):
        resp = staff_client.post(
            "/api/rally/v1/activities/deferred/99/capture?team_id=2",
        )
    assert resp.status_code == 404


def test_capture_missing_team_id(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.api.api_v1.deferred_judging.crud_activity.get", new=AsyncMock(return_value=_activity())):
        resp = staff_client.post(
            "/api/rally/v1/activities/deferred/1/capture",
        )
    assert resp.status_code == 400


def test_capture_existing_result_appends(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    existing = _result(media_urls=["http://r2/existing.jpg"])

    with patch("app.api.api_v1.deferred_judging.crud_activity.get", new=AsyncMock(return_value=_activity())), \
         patch("app.api.api_v1.deferred_judging.crud_result.get_by_activity_and_team", new=AsyncMock(return_value=existing)):
        resp = staff_client.post(
            "/api/rally/v1/activities/deferred/1/capture?team_id=2",
        )
    assert resp.status_code == 201


# ---------- judge ----------

def test_judge_result(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    r = _result()

    with patch("app.api.api_v1.deferred_judging.crud_result.get", new=AsyncMock(return_value=r)), \
         patch("app.api.api_v1.deferred_judging.ScoringService") as mock_ss:
        mock_ss.return_value.update_team_scores = AsyncMock()
        resp = staff_client.put(
            "/api/rally/v1/activities/results/1/judge",
            json={"points": 75, "notes": "great outfit"},
        )
    assert resp.status_code == 200
    assert r.points_score == 75
    assert r.judgment_status == "judged"
    assert r.is_completed is True


def test_judge_result_not_found(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.api.api_v1.deferred_judging.crud_result.get", new=AsyncMock(return_value=None)):
        resp = staff_client.put(
            "/api/rally/v1/activities/results/99/judge",
            json={"points": 50},
        )
    assert resp.status_code == 404


def test_judge_already_judged(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    r = _result(judgment_status="judged", is_completed=True, final_score=80.0)
    with patch("app.api.api_v1.deferred_judging.crud_result.get", new=AsyncMock(return_value=r)):
        resp = staff_client.put(
            "/api/rally/v1/activities/results/1/judge",
            json={"points": 50},
        )
    assert resp.status_code == 400


# ---------- list pending ----------

def test_list_pending_judgments(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[_result(), _result(id=2)]))))
    )
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = staff_client.get("/api/rally/v1/activities/deferred/pending")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_pending_empty(staff_client: TestClient) -> None:
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[]))))
    )
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = staff_client.get("/api/rally/v1/activities/deferred/pending")
    assert resp.status_code == 200
    assert resp.json() == []
