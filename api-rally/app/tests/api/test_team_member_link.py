"""API tests for admin OIDC-account search and placeholder linking, against real Postgres."""

from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.team import TeamCreate
from app.schemas.user import UserCreate
from app.tests.conftest import make_event as _make_event


async def _make_team(pg_session, name="Os Bons"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


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
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        await _make_event(pg_session)
        found = [SimpleNamespace(id=7, name="Ana", email="ana@nei.pt", authentik_sub="sub-ana")]
        monkeypatch.setattr("app.api.authentik_client.search_users", AsyncMock(return_value=[]))
        monkeypatch.setattr("app.crud.user.search_oidc_users", AsyncMock(return_value=found))

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
        found = [
            AuthentikUser(authentik_sub="uuid-1", name="Bea", username="bea", email="bea@nei.pt")
        ]
        monkeypatch.setattr("app.api.authentik_client.search_users", AsyncMock(return_value=found))
        monkeypatch.setattr("app.crud.user.get_by_authentik_subs", AsyncMock(return_value=[]))

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

    async def test_link_claims_placeholder_that_has_the_account_email(
        self, pg_session, pg_client, as_admin
    ):
        """Placeholder added with the person's email: the email is unique, so a
        new row could not be inserted (500). The placeholder is claimed in place."""
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id, is_captain=True)
        placeholder.email = "j@nei.pt"
        pg_session.add(placeholder)
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-j", "name": "João", "email": "J@nei.pt"},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == placeholder.id
        assert body["is_captain"] is True
        assert body["is_linked"] is True
        await pg_session.refresh(placeholder)
        assert placeholder.authentik_uuid == "uuid-j"
        assert placeholder.authentik_sub is None
        assert placeholder.team_id == team.id

    async def test_link_adopts_unclaimed_mirror_with_same_email(
        self, pg_session, pg_client, as_admin
    ):
        """A rally-staff mirror (email set, no authentik_sub yet) is adopted
        instead of colliding on the unique email index."""
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        mirror = await crud_user.get_or_create_mirror(
            pg_session, name="Ana", email="ana@nei.pt", scope="rally-staff"
        )

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-ana", "name": "Ana", "email": "ana@nei.pt"},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == mirror.id
        await pg_session.refresh(mirror)
        assert mirror.authentik_uuid == "uuid-ana"
        assert mirror.team_id == team.id

    async def test_link_person_who_logged_in_under_a_hashed_subject(
        self, pg_session, pg_client, as_admin
    ):
        """Search hands out the Authentik uuid; the person's row is keyed on the
        (hashed) OIDC subject. They are matched by email, not duplicated."""
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        existing = await crud_user.create_for_oidc(
            pg_session, authentik_sub="hashed-sub-x", name="X", email="x@nei.pt", scopes=[]
        )

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-x", "name": "X", "email": "x@nei.pt"},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == existing.id
        await pg_session.refresh(existing)
        assert existing.authentik_sub == "hashed-sub-x"
        assert existing.authentik_uuid == "uuid-x"
        assert existing.team_id == team.id

    async def test_link_rejects_email_bound_to_another_authentik_account(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        other = await crud_user.create_for_oidc(
            pg_session, authentik_sub=None, name="Outro", email="x@nei.pt", scopes=[]
        )
        other.authentik_uuid = "uuid-other"
        pg_session.add(other)
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-x", "name": "X", "email": "x@nei.pt"},
        )

        assert resp.status_code == 400, resp.text

    async def test_double_link_of_same_placeholder_is_rejected_not_500(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        url = f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link"

        first = pg_client.post(url, json={"authentik_sub": "uuid-a", "email": "a@nei.pt"})
        second = pg_client.post(url, json={"authentik_sub": "uuid-b", "email": "b@nei.pt"})

        assert first.status_code == 200, first.text
        assert second.status_code in (400, 404), second.text

    async def test_failed_link_leaves_no_orphan_row(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock

        from sqlalchemy.exc import IntegrityError

        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        # Already-logged-in caller path records participation; make it blow up.
        await crud_user.create_for_oidc(
            pg_session, authentik_sub="uuid-z", name="Z", email=None, scopes=[]
        )
        monkeypatch.setattr(
            "app.crud.participation.record",
            AsyncMock(side_effect=IntegrityError("x", {}, Exception())),
        )

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-z"},
        )

        assert resp.status_code == 400, resp.text
        await pg_session.refresh(placeholder)
        assert placeholder.team_id == team.id
        z = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="uuid-z")
        await pg_session.refresh(z)
        assert z.team_id is None

    async def test_admin_link_uses_authentik_email_not_body(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock

        from app.api.authentik_client import AuthentikUser

        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        monkeypatch.setattr("app.api.authentik_client.is_configured", lambda: True)
        monkeypatch.setattr(
            "app.api.authentik_client.get_user",
            AsyncMock(
                return_value=AuthentikUser(
                    authentik_sub="uuid-real", name="Real", username="r", email="real@nei.pt"
                )
            ),
        )

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-real", "name": "Fake", "email": "victim@nei.pt"},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["email"] == "real@nei.pt"
        assert resp.json()["name"] == "Real"

    async def test_admin_link_rejects_unknown_authentik_account(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock

        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        monkeypatch.setattr("app.api.authentik_client.is_configured", lambda: True)
        monkeypatch.setattr("app.api.authentik_client.get_user", AsyncMock(return_value=None))

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link",
            json={"authentik_sub": "uuid-nope"},
        )

        assert resp.status_code == 400, resp.text

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
        target = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="sub-x")
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
