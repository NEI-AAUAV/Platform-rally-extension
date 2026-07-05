"""API tests for admin OIDC-account search and placeholder linking."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.auth import api_nei_auth
from app.api.deps import get_db, get_participant


def _auth() -> SimpleNamespace:
    return SimpleNamespace(oidc_sub="admin-sub", name="Admin", email="a@nei.pt", scopes=["admin"])


def _participant() -> SimpleNamespace:
    return SimpleNamespace(id=1, name="Admin", disabled=False, staff_checkpoint_id=None, scopes=["admin"])


@pytest.fixture
def client():
    app.dependency_overrides[api_nei_auth] = _auth
    app.dependency_overrides[get_participant] = _participant
    # Permission check is exercised separately; bypass it for the happy paths.
    with patch("app.api.api_v1.user.require_team_management_permission"), \
         patch("app.api.api_v1.team_members.require_team_management_permission"):
        yield TestClient(app)
    app.dependency_overrides.clear()


def _override_db(db: AsyncMock) -> None:
    app.dependency_overrides[get_db] = lambda: db


def test_search_falls_back_to_local_when_authentik_unconfigured(client: TestClient) -> None:
    found = [SimpleNamespace(id=7, name="Ana", email="ana@nei.pt", authentik_sub="sub-ana")]
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with patch("app.api.authentik_client.search_users", new=AsyncMock(return_value=[])), \
         patch("app.crud.user.search_oidc_users", new=AsyncMock(return_value=found)):
        resp = client.get("/api/rally/v1/user/search", params={"q": "ana"})
    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["authentik_sub"] == "sub-ana"
    assert body[0]["id"] == 7


def test_search_uses_authentik_when_configured(client: TestClient) -> None:
    from app.api.authentik_client import AuthentikUser

    found = [AuthentikUser(authentik_sub="uuid-1", name="Bea", username="bea", email="bea@nei.pt")]
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with patch("app.api.authentik_client.search_users", new=AsyncMock(return_value=found)), \
         patch("app.crud.user.get_by_authentik_subs", new=AsyncMock(return_value=[])):
        resp = client.get("/api/rally/v1/user/search", params={"q": "bea"})
    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["authentik_sub"] == "uuid-1"
    # Never logged in locally → no local mirror id.
    assert body[0]["id"] is None


def test_search_short_query_returns_empty(client: TestClient) -> None:
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    resp = client.get("/api/rally/v1/user/search", params={"q": "a"})
    assert resp.status_code == 200
    assert resp.json() == []


def _link_db(*, team, placeholder) -> AsyncMock:
    """db.get dispatches: Team→team, User(placeholder.id)→placeholder."""
    from app.models.team import Team

    def _get(model, oid):
        if model is Team:
            return team
        if oid == placeholder.id:
            return placeholder
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=_get)
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


def test_link_moves_membership_to_existing_account(client: TestClient) -> None:
    team = SimpleNamespace(id=1, name="Os Bons", event_id=5, total=42, classification=2)
    placeholder = SimpleNamespace(id=2, name="João", team_id=1, is_captain=True, authentik_sub=None)
    target = SimpleNamespace(id=7, name="João Silva", email="j@nei.pt", team_id=None, is_captain=False, authentik_sub="sub-j")
    _override_db(_link_db(team=team, placeholder=placeholder))
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=target)), \
         patch("app.crud.participation.record", new=AsyncMock(return_value=SimpleNamespace(id=1))):
        resp = client.post(
            "/api/rally/v1/team/1/members/2/link", json={"authentik_sub": "sub-j"}
        )
    assert resp.status_code == 200
    assert resp.json()["id"] == 7
    assert target.team_id == 1
    assert target.is_captain is True


def test_link_mirrors_account_that_never_logged_in(client: TestClient) -> None:
    team = SimpleNamespace(id=1, name="Os Bons", event_id=5, total=0, classification=1)
    placeholder = SimpleNamespace(id=2, name="João", team_id=1, is_captain=False, authentik_sub=None)
    created = SimpleNamespace(id=9, name="João", email="j@nei.pt", team_id=None, is_captain=False, authentik_sub="uuid-new")
    _override_db(_link_db(team=team, placeholder=placeholder))
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)), \
         patch("app.crud.user.create_for_oidc", new=AsyncMock(return_value=created)), \
         patch("app.crud.participation.record", new=AsyncMock(return_value=SimpleNamespace(id=1))):
        resp = client.post(
            "/api/rally/v1/team/1/members/2/link",
            json={"authentik_sub": "uuid-new", "name": "João", "email": "j@nei.pt"},
        )
    assert resp.status_code == 200
    assert resp.json()["id"] == 9
    assert created.team_id == 1


def test_link_rejects_already_linked_placeholder(client: TestClient) -> None:
    team = SimpleNamespace(id=1, name="Os Bons", event_id=5)
    placeholder = SimpleNamespace(id=2, name="João", team_id=1, is_captain=False, authentik_sub="already")
    _override_db(_link_db(team=team, placeholder=placeholder))
    resp = client.post("/api/rally/v1/team/1/members/2/link", json={"authentik_sub": "sub-x"})
    assert resp.status_code == 400


def test_link_rejects_target_already_on_team(client: TestClient) -> None:
    team = SimpleNamespace(id=1, name="Os Bons", event_id=5)
    placeholder = SimpleNamespace(id=2, name="João", team_id=1, is_captain=False, authentik_sub=None)
    target = SimpleNamespace(id=7, name="X", email=None, team_id=3, is_captain=False, authentik_sub="sub-x")
    _override_db(_link_db(team=team, placeholder=placeholder))
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=target)):
        resp = client.post("/api/rally/v1/team/1/members/2/link", json={"authentik_sub": "sub-x"})
    assert resp.status_code == 400


def test_link_rejects_member_not_on_team(client: TestClient) -> None:
    team = SimpleNamespace(id=1, name="Os Bons", event_id=5)
    placeholder = SimpleNamespace(id=2, name="João", team_id=99, is_captain=False, authentik_sub=None)
    _override_db(_link_db(team=team, placeholder=placeholder))
    resp = client.post("/api/rally/v1/team/1/members/2/link", json={"authentik_sub": "sub-x"})
    assert resp.status_code == 400
