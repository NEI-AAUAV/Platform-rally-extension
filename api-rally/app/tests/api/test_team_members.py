"""Tests for Team Members API endpoints, against real Postgres."""

from app.api.auth import AuthData, api_nei_auth
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.main import app
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_settings(pg_session, **overrides):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, **overrides)
    )


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


class TestTeamMembersAPI:
    async def test_add_team_member_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "New Member", "email": "new@example.com", "is_captain": False},
        )

        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "New Member"
        assert data["email"] == "new@example.com"

    async def test_add_team_member_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/team/999999/members",
            json={"name": "New Member", "email": "new@example.com", "is_captain": False},
        )

        assert resp.status_code == 404

    async def test_add_team_member_limit_reached(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=1)
        team = await _make_team(pg_session)
        first = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "First", "email": "first@example.com", "is_captain": False},
        )
        assert first.status_code == 201

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Second", "email": "second@example.com", "is_captain": False},
        )

        assert resp.status_code == 400
        assert "member limit reached" in resp.json()["detail"]

    async def test_add_team_member_as_captain_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Captain Member", "email": "captain@example.com", "is_captain": True},
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_captain"] is True

    async def test_add_team_member_captain_already_exists(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        first = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Cap1", "email": "cap1@example.com", "is_captain": True},
        )
        assert first.status_code == 201

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "New Captain", "email": "newcaptain@example.com", "is_captain": True},
        )

        assert resp.status_code == 400
        assert "already has a captain" in resp.json()["detail"]

    async def test_remove_team_member_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        added = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Test User", "email": "test@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.delete(f"/api/rally/v1/team/{team.id}/members/{member_id}")

        assert resp.status_code == 200

    async def test_remove_team_member_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)

        resp = pg_client.delete(f"/api/rally/v1/team/{team.id}/members/999999")

        assert resp.status_code == 404

    async def test_update_team_member_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        added = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Original", "email": "orig@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/members/{member_id}",
            json={"name": "Updated User", "email": "updated@example.com"},
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["name"] == "Updated User"
        assert data["email"] == "updated@example.com"

    async def test_get_team_members_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Test User", "email": "test@example.com", "is_captain": False},
        )

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}/members")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test User"

    async def test_get_team_members_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/team/999999/members")

        assert resp.status_code == 404

    async def test_update_team_member_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put(
            "/api/rally/v1/team/999999/members/1",
            json={"name": "Updated"},
        )

        assert resp.status_code == 404

    async def test_update_team_member_user_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/members/999999",
            json={"name": "Updated"},
        )

        assert resp.status_code == 404

    async def test_update_team_member_not_on_team(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        other_team = await _make_team(pg_session, name="Other")
        added = pg_client.post(
            f"/api/rally/v1/team/{other_team.id}/members",
            json={"name": "Other Member", "email": "other@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/members/{member_id}",
            json={"name": "Updated"},
        )

        assert resp.status_code == 400
        assert "not a member" in resp.json()["detail"]

    async def test_update_team_member_captain_already_exists(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Captain", "email": "cap@example.com", "is_captain": True},
        )
        added = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Member", "email": "member@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/members/{member_id}",
            json={"is_captain": True},
        )

        assert resp.status_code == 400
        assert "already has a captain" in resp.json()["detail"]

    async def test_update_team_member_promote_only_captain(self, pg_session, pg_client, as_admin):
        # Setting is_captain=True on the sole member (no existing captain)
        # should succeed instead of hitting the conflict branch.
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        added = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Solo", "email": "solo@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/members/{member_id}",
            json={"is_captain": True},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["is_captain"] is True

    async def test_remove_team_member_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete("/api/rally/v1/team/999999/members/1")

        assert resp.status_code == 404

    async def test_remove_team_member_not_on_team(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, max_members_per_team=4)
        team = await _make_team(pg_session)
        other_team = await _make_team(pg_session, name="Other")
        added = pg_client.post(
            f"/api/rally/v1/team/{other_team.id}/members",
            json={"name": "Other Member", "email": "other@example.com", "is_captain": False},
        )
        member_id = added.json()["id"]

        resp = pg_client.delete(f"/api/rally/v1/team/{team.id}/members/{member_id}")

        assert resp.status_code == 400
        assert "not a member" in resp.json()["detail"]


class TestLinkTeamMemberNotFound:
    async def test_link_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/team/999999/members/1/link",
            json={"authentik_sub": "sub-x"},
        )

        assert resp.status_code == 404

    async def test_link_user_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members/999999/link",
            json={"authentik_sub": "sub-x"},
        )

        assert resp.status_code == 404


class TestLinkSelfTeamMember:
    """`link-self`: OIDC-authenticated caller claims their own placeholder slot."""

    def _oidc_override(self, oidc_sub="oidc-sub-1", name="Real Name", email="real@nei.pt"):
        auth = AuthData(oidc_sub=oidc_sub, name=name, email=email, scopes=[])
        app.dependency_overrides[api_nei_auth] = lambda: auth
        return app

    def _clear_oidc_override(self):
        from app.api.auth import api_nei_auth
        from app.main import app

        app.dependency_overrides.pop(api_nei_auth, None)

    async def _make_placeholder(self, pg_session, team_id, name="Placeholder", is_captain=False):
        from app.crud.crud_user import user as crud_user
        from app.schemas.user import UserCreate

        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name=name))
        placeholder.team_id = team_id
        placeholder.is_captain = is_captain
        pg_session.add(placeholder)
        await pg_session.commit()
        await pg_session.refresh(placeholder)
        return placeholder

    async def test_link_self_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await self._make_placeholder(pg_session, team.id, is_captain=True)

        self._oidc_override()
        try:
            resp = pg_client.post(
                f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link-self"
            )
        finally:
            self._clear_oidc_override()

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Real Name"
        assert body["is_captain"] is True
        assert body["is_linked"] is True

    async def test_link_self_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        self._oidc_override()
        try:
            resp = pg_client.post("/api/rally/v1/team/999999/members/1/link-self")
        finally:
            self._clear_oidc_override()

        assert resp.status_code == 404

    async def test_link_self_user_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)

        self._oidc_override()
        try:
            resp = pg_client.post(f"/api/rally/v1/team/{team.id}/members/999999/link-self")
        finally:
            self._clear_oidc_override()

        assert resp.status_code == 404

    async def test_link_self_placeholder_not_on_team(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        other_team = await _make_team(pg_session, name="Other")
        placeholder = await self._make_placeholder(pg_session, other_team.id)

        self._oidc_override()
        try:
            resp = pg_client.post(
                f"/api/rally/v1/team/{team.id}/members/{placeholder.id}/link-self"
            )
        finally:
            self._clear_oidc_override()

        assert resp.status_code == 400


class TestStaffRegistrationGate:
    """B4: allow_staff_registration gate on add_team_member."""

    def _staff_override(self):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.main import app
        from app.schemas.user import DetailedUser

        user = DetailedUser(id=99, name="Staff", disabled=False, scopes=["rally-staff"])
        auth = AuthData(oidc_sub="u1", name="Staff", scopes=["rally-staff"])
        app.dependency_overrides[api_nei_auth] = lambda: auth
        app.dependency_overrides[deps.get_participant] = lambda: user
        return app

    def _clear_staff_override(self):
        from app.api import deps
        from app.api.auth import api_nei_auth
        from app.main import app

        app.dependency_overrides.pop(api_nei_auth, None)
        app.dependency_overrides.pop(deps.get_participant, None)

    async def test_staff_blocked_when_registration_disabled(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_settings(pg_session, allow_staff_registration=False)
        team = await _make_team(pg_session)

        self._staff_override()
        try:
            resp = pg_client.post(
                f"/api/rally/v1/team/{team.id}/members",
                json={"name": "Walk-up", "email": "wu@example.com", "is_captain": False},
            )
        finally:
            self._clear_staff_override()

        assert resp.status_code == 403

    async def test_staff_allowed_when_registration_enabled(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_settings(pg_session, allow_staff_registration=True, max_members_per_team=10)
        team = await _make_team(pg_session)

        self._staff_override()
        try:
            resp = pg_client.post(
                f"/api/rally/v1/team/{team.id}/members",
                json={"name": "Walk-up", "email": "wu@example.com", "is_captain": False},
            )
        finally:
            self._clear_staff_override()

        assert resp.status_code != 403, resp.text

    async def test_admin_bypasses_gate(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_settings(pg_session, allow_staff_registration=False, max_members_per_team=10)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/team/{team.id}/members",
            json={"name": "Walk-up", "email": "wu@example.com", "is_captain": False},
        )

        assert resp.status_code != 403
