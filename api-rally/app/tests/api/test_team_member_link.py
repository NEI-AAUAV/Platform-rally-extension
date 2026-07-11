"""API tests for admin OIDC-account search and placeholder linking, against real Postgres."""
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.team import TeamCreate
from app.schemas.user import UserCreate


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_team(pg_session, name="Os Bons"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_placeholder(pg_session, team_id, name="João", is_captain=False):
    user = await crud_user.create(pg_session, obj_in=UserCreate(name=name))
    user.team_id = team_id
    user.is_captain = is_captain
    pg_session.add(user)
    await pg_session.commit()
    await pg_session.refresh(user)
    return user


class TestUserSearch:
    async def test_search_falls_back_to_local_when_authentik_unconfigured(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock
        from types import SimpleNamespace

        await _make_event(pg_session)
        found = [SimpleNamespace(id=7, name="Ana", email="ana@nei.pt", authentik_sub="sub-ana")]
        monkeypatch.setattr(
            "app.api.authentik_client.search_users", AsyncMock(return_value=[])
        )
        monkeypatch.setattr(
            "app.crud.user.search_oidc_users", AsyncMock(return_value=found)
        )

        resp = pg_client.get("/api/rally/v1/user/search", params={"q": "ana"})

        assert resp.status_code == 200
        body = resp.json()
        assert body[0]["authentik_sub"] == "sub-ana"
        assert body[0]["id"] == 7

    async def test_search_uses_authentik_when_configured(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock
        from app.api.authentik_client import AuthentikUser

        await _make_event(pg_session)
        found = [AuthentikUser(authentik_sub="uuid-1", name="Bea", username="bea", email="bea@nei.pt")]
        monkeypatch.setattr(
            "app.api.authentik_client.search_users", AsyncMock(return_value=found)
        )
        monkeypatch.setattr(
            "app.crud.user.get_by_authentik_subs", AsyncMock(return_value=[])
        )

        resp = pg_client.get("/api/rally/v1/user/search", params={"q": "bea"})

        assert resp.status_code == 200
        body = resp.json()
        assert body[0]["authentik_sub"] == "uuid-1"
        assert body[0]["id"] is None

    async def test_search_short_query_returns_empty(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/search", params={"q": "a"})

        assert resp.status_code == 200
        assert resp.json() == []


class TestLinkTeamMember:
    async def test_link_moves_membership_to_existing_account(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id, is_captain=True)
        target = await crud_user.create_for_oidc(
            pg_session, authentik_sub="sub-j", name="João Silva", email="j@nei.pt", scopes=[]
        )

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "sub-j"},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == target.id
        assert body["is_captain"] is True

    async def test_link_mirrors_account_that_never_logged_in(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id, is_captain=False)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-new", "name": "João", "email": "j@nei.pt"},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "João"
        assert body["is_linked"] is True

    async def test_link_rejects_already_linked_placeholder(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        placeholder.authentik_sub = "already"
        pg_session.add(placeholder)
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "sub-x"},
        )

        assert resp.status_code == 400

    async def test_link_rejects_target_already_on_team(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        other_team = await _make_team(pg_session, name="Outra")
        placeholder = await _make_placeholder(pg_session, team.id)
        await crud_user.create_for_oidc(
            pg_session, authentik_sub="sub-x", name="X", email=None, scopes=[]
        )
        target = (await crud_user.get_by_authentik_sub(pg_session, authentik_sub="sub-x"))
        target.team_id = other_team.id
        pg_session.add(target)
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "sub-x"},
        )

        assert resp.status_code == 400

    async def test_link_rejects_member_not_on_team(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        other_team = await _make_team(pg_session, name="Outra")
        placeholder = await _make_placeholder(pg_session, other_team.id)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "sub-x"},
        )

        assert resp.status_code == 400
