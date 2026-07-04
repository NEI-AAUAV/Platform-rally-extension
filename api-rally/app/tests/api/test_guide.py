"""Tests for the guide checkpoints endpoint."""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_guide
from app.api.auth import api_nei_auth
from app.schemas.user import DetailedUser
from app.models.activity import EventType
from app.models.checkpoint_media import MediaKind


def _guide_user() -> DetailedUser:
    return DetailedUser(id=2, name="Guide", disabled=False, team_id=None, is_captain=False, scopes=["rally-guide"])


def _make_client(user: DetailedUser) -> TestClient:
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_guide] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=user.scopes)
    return TestClient(app)


def _media(id=1, kind=MediaKind.photo, image_url=None, caption=None, order=0):
    m = Mock()
    m.id = id
    m.kind = kind
    m.image_url = image_url
    m.caption = caption
    m.order = order
    return m


def _indication(id=1, hint="Hint", question=None, expected_answer=None, order=0):
    i = Mock()
    i.id = id
    i.hint = hint
    i.question = question
    i.expected_answer = expected_answer
    i.order = order
    return i


def _checkpoint(id=10, name="Posto 1", order=1, media=None, indications=None):
    cp = Mock()
    cp.id = id
    cp.name = name
    cp.order = order
    cp.description = "desc"
    cp.latitude = 1.0
    cp.longitude = 2.0
    cp.media = media or []
    cp.guide_indications = indications or []
    return cp


def _settings(enabled=True, active=True):
    s = Mock()
    s.guide_mode_enabled = enabled
    s.guide_mode_active = active
    return s


def _event(event_type=EventType.GENERIC.value):
    e = Mock()
    e.id = 1
    e.event_type = event_type
    return e


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_guide_checkpoints_403_when_mode_off_and_not_peddy_paper():
    client = _make_client(_guide_user())
    with patch("app.api.api_v1.guide.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.guide.rally_settings.get_or_create", new=AsyncMock(return_value=_settings(enabled=False, active=False))):
        resp = client.get("/api/rally/v1/guide/checkpoints")
    assert resp.status_code == 403


def test_guide_checkpoints_maps_media_and_indications():
    cp = _checkpoint(
        media=[
            _media(id=1, kind=MediaKind.photo, image_url="https://r2/p.png", order=0),
            _media(id=2, kind=MediaKind.fun_fact, caption="Fun", order=1),
        ],
        indications=[_indication(id=1, hint="Give this hint", question="Q?", expected_answer="A")],
    )
    scalars = Mock()
    scalars.all = Mock(return_value=[cp])
    db = Mock()
    db.scalars = AsyncMock(return_value=scalars)

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_guide] = lambda: _guide_user()
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=["rally-guide"])

    with patch("app.api.api_v1.guide.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.guide.rally_settings.get_or_create", new=AsyncMock(return_value=_settings())):
        resp = TestClient(app).get("/api/rally/v1/guide/checkpoints")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    cp_data = data[0]
    # Bug-fix regression: photo maps image_url -> url, order -> display_order
    photo = next(m for m in cp_data["media"] if m["kind"] == "photo")
    assert photo["url"] == "https://r2/p.png"
    assert photo["display_order"] == 0
    fun = next(m for m in cp_data["media"] if m["kind"] == "fun_fact")
    assert fun["url"] is None
    # Structured indications surfaced
    assert cp_data["indications"][0]["hint"] == "Give this hint"
    assert cp_data["indications"][0]["question"] == "Q?"


def test_guide_checkpoints_allowed_for_peddy_paper_even_if_mode_off():
    scalars = Mock()
    scalars.all = Mock(return_value=[])
    db = Mock()
    db.scalars = AsyncMock(return_value=scalars)

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_guide] = lambda: _guide_user()
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=["rally-guide"])

    with patch("app.api.api_v1.guide.rally_event.get_current", new=AsyncMock(return_value=_event(EventType.PEDDY_PAPER.value))), \
         patch("app.api.api_v1.guide.rally_settings.get_or_create", new=AsyncMock(return_value=_settings(enabled=False, active=False))):
        resp = TestClient(app).get("/api/rally/v1/guide/checkpoints")
    assert resp.status_code == 200
    assert resp.json() == []
