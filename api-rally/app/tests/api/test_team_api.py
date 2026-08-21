"""API tests for the core Team CRUD/listing endpoints (`app/api/api_v1/team.py`),
against real Postgres.
"""

from app.api.auth import api_nei_auth, api_nei_auth_optional
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.main import app
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


class TestGetTeams:
    async def test_get_teams_lists_all(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _make_team(pg_session, "Alpha")
        await _make_team(pg_session, "Beta")

        resp = pg_client.get("/api/rally/v1/team/")

        assert resp.status_code == 200, resp.text
        names = {t["name"] for t in resp.json()}
        assert {"Alpha", "Beta"} <= names

    async def test_get_teams_empty(self, pg_session, pg_client):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/team/")

        assert resp.status_code == 200
        assert resp.json() == []


class TestGetOwnTeam:
    async def test_get_own_team_success(self, pg_session, pg_client):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.main import app
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Mine")
        user = DetailedUser(id=1, name="P", disabled=False, team_id=team.id, scopes=[])
        app.dependency_overrides[deps.get_participant] = lambda: user
        app.dependency_overrides[api_nei_auth] = lambda: AuthData(
            oidc_sub="p1", name="P", scopes=[]
        )
        try:
            resp = pg_client.get("/api/rally/v1/team/me")
        finally:
            app.dependency_overrides.pop(deps.get_participant, None)
            app.dependency_overrides.pop(api_nei_auth, None)

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == team.id


class TestGetOwnTeamAccessCode:
    async def test_get_own_team_exposes_access_code(self, pg_session, pg_client):
        from app.api import deps
        from app.api.auth import AuthData
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Mine")
        user = DetailedUser(id=1, name="P", disabled=False, team_id=team.id, scopes=[])
        app.dependency_overrides[deps.get_participant] = lambda: user
        app.dependency_overrides[api_nei_auth] = lambda: AuthData(
            oidc_sub="p1", name="P", scopes=[]
        )
        try:
            resp = pg_client.get("/api/rally/v1/team/me")
        finally:
            app.dependency_overrides.pop(deps.get_participant, None)
            app.dependency_overrides.pop(api_nei_auth, None)

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] == team.access_code


class TestGetTeamById:
    @staticmethod
    def _as_participant(team_id):
        from app.api import deps
        from app.api.auth import AuthData
        from app.schemas.user import DetailedUser

        user = DetailedUser(id=1, name="P", disabled=False, team_id=team_id, scopes=[])
        app.dependency_overrides[deps.get_current_user_optional] = lambda: user
        app.dependency_overrides[api_nei_auth_optional] = lambda: AuthData(
            oidc_sub="p1", name="P", scopes=[]
        )

    @staticmethod
    def _as_team_token(team_id):
        """A team logged in with its access code: no OIDC identity at all."""
        from app.api import deps
        from app.schemas.team_auth import TeamTokenData

        app.dependency_overrides[deps.get_current_team_optional] = lambda: TeamTokenData(
            team_id=team_id, team_name="T"
        )

    @staticmethod
    def _clear_overrides():
        from app.api import deps

        app.dependency_overrides.pop(deps.get_current_user_optional, None)
        app.dependency_overrides.pop(deps.get_current_team_optional, None)
        app.dependency_overrides.pop(deps.get_participant, None)
        app.dependency_overrides.pop(api_nei_auth_optional, None)
        app.dependency_overrides.pop(api_nei_auth, None)

    async def test_get_team_by_id_success(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Findable")
        self._as_participant(team.id)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Findable"

    async def test_get_team_by_id_requires_authentication(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Private")

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code in (401, 403), resp.text

    async def test_get_team_by_id_never_leaks_access_code(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Other")
        self._as_participant(team_id=999)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] is None
        assert team.access_code not in resp.text

    async def test_get_team_by_id_returns_access_code_to_admin(self, pg_session, pg_client):
        from app.api import deps
        from app.api.auth import AuthData
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Managed")
        admin = DetailedUser(id=2, name="A", disabled=False, team_id=None, scopes=["admin"])
        app.dependency_overrides[deps.get_current_user_optional] = lambda: admin
        app.dependency_overrides[api_nei_auth_optional] = lambda: AuthData(
            oidc_sub="a1", name="A", scopes=["admin"]
        )
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] == team.access_code

    async def test_get_team_by_id_accepts_a_team_token(self, pg_session, pg_client):
        """Teams authenticate with an access-code-issued token, which never
        validates against the OIDC provider — the team's own progress view
        depends on this route accepting it.
        """

        await _make_event(pg_session)
        team = await _make_team(pg_session, "TokenTeam")
        self._as_team_token(team.id)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "TokenTeam"
        assert resp.json()["access_code"] == team.access_code

    async def test_team_token_does_not_leak_another_teams_access_code(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Theirs")
        self._as_team_token(team.id + 1000)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] is None
        assert team.access_code not in resp.text

    async def test_get_team_by_id_not_found(self, pg_session, pg_client):
        await _make_event(pg_session)
        self._as_participant(1)
        try:
            resp = pg_client.get("/api/rally/v1/team/999999")
        finally:
            self._clear_overrides()

        assert resp.status_code == 404

    async def test_get_team_by_id_checkpoint_progress_with_activities(
        self, pg_session, pg_client, as_admin
    ):
        """Exercises `_compute_checkpoint_progress`'s activity-based branch:
        a checkpoint with an active activity only counts as completed once
        every active activity has a completed result.
        """

        await _make_event(pg_session)
        cp1 = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        cp2 = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP2", order=2), commit=True
        )
        team = await _make_team(pg_session, "Progressing")
        activity1 = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act1",
                activity_type=ActivityType.GENERAL,
                checkpoint_id=cp1.id,
                config={},
            ),
        )
        # cp2 has no active activity -> counted done only if checked in.
        await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act2Inactive",
                activity_type=ActivityType.GENERAL,
                checkpoint_id=cp2.id,
                config={},
                is_active=False,
            ),
        )

        # Score+complete activity1 via the real evaluate endpoint (goes
        # through ScoringService, which sets is_completed and auto-checks the
        # team into cp1, so `team.times` gets one entry here).
        as_admin.staff_checkpoint_id = cp1.id
        eval_url = f"/api/rally/v1/staff/teams/{team.id}/activities/{activity1.id}/evaluate"
        resp = pg_client.post(eval_url, json={"result_data": {"assigned_points": 10}})
        assert resp.status_code == 200, resp.text

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Auto-advance on full-completion checks the team into cp1 *and* bumps
        # it straight to cp2 (checked_in_count becomes 2), so cp2's
        # no-active-activity branch also counts as done
        # (checked_in_count=2 >= cp2.order=2) — both checkpoints complete.
        assert body["last_checkpoint_number"] == 2
        # Every post done, so there is no current one — the field is None
        # rather than clamped to the last order, which the participant screen
        # would otherwise read as "still on post 2" and never show the
        # finished card. See determine_current_order.
        assert body["current_checkpoint_number"] is None

    async def test_get_team_by_id_checkpoint_progress_all_completed(self, pg_session, pg_client):
        """When every checkpoint counts as done, current == last (no +1)."""
        import datetime as dt

        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.checkpoint import CheckPointCreate

        await _make_event(pg_session)
        await crud_checkpoint.create(pg_session, obj_in=CheckPointCreate(name="OnlyCP", order=1))
        team = await _make_team(pg_session, "Finisher")
        team.times = [dt.datetime(2026, 1, 1)]
        pg_session.add(team)
        await pg_session.commit()

        self._as_participant(team.id)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_checkpoint_number"] == 1
        assert body["current_checkpoint_number"] is None

    async def test_get_team_by_id_checkpoint_progress_stops_at_incomplete_activity(
        self, pg_session, pg_client, as_admin
    ):
        """A checkpoint with two active activities where only one is
        completed must stop progress there (the `else: break` branch), not
        be counted as done."""
        from app.crud.crud_activity import activity as crud_activity
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.activity import ActivityCreate, ActivityType
        from app.schemas.checkpoint import CheckPointCreate

        await _make_event(pg_session)
        cp1 = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        team = await _make_team(pg_session, "PartiallyDone")
        activity1 = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act1", activity_type=ActivityType.GENERAL, checkpoint_id=cp1.id, config={}
            ),
        )
        await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act2", activity_type=ActivityType.GENERAL, checkpoint_id=cp1.id, config={}
            ),
        )

        as_admin.staff_checkpoint_id = cp1.id
        eval_url = f"/api/rally/v1/staff/teams/{team.id}/activities/{activity1.id}/evaluate"
        resp = pg_client.post(eval_url, json={"result_data": {"assigned_points": 10}})
        assert resp.status_code == 200, resp.text

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Only one of cp1's two activities is scored -> not fully complete.
        assert body["last_checkpoint_number"] == 0
        assert body["current_checkpoint_number"] == 1


class TestAddCheckpoint:
    async def test_add_checkpoint_success_as_admin(self, pg_session, pg_client, as_admin):
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.checkpoint import CheckPointCreate

        await _make_event(pg_session)
        checkpoint = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        team = await _make_team(pg_session, "Racing")

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/checkpoint",
            json={
                "checkpoint_id": checkpoint.id,
                "question_score": 1,
                "time_score": 30,
                "pukes": 0,
                "skips": 0,
            },
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert len(body["times"]) == 1

    async def test_add_checkpoint_missing_id_admin_400(self, pg_session, pg_client, as_admin):
        # Admin/manager must specify a checkpoint_id explicitly (they have
        # access to all, so there is no "assigned" checkpoint to default to).
        await _make_event(pg_session)
        team = await _make_team(pg_session, "NoCheckpoint")

        resp = pg_client.put(
            f"/api/rally/v1/team/{team.id}/checkpoint",
            json={
                "question_score": 1,
                "time_score": 30,
                "pukes": 0,
                "skips": 0,
            },
        )

        assert resp.status_code == 400


class TestCreateTeam:
    async def test_create_team_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post("/api/rally/v1/team/", json={"name": "New Team"})

        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == "New Team"

    async def test_create_team_forbidden_for_non_admin_participant(self, pg_session, pg_client):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.main import app
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        user = DetailedUser(id=2, name="Plain", disabled=False, scopes=[])
        app.dependency_overrides[deps.get_participant] = lambda: user
        app.dependency_overrides[api_nei_auth] = lambda: AuthData(
            oidc_sub="p2", name="Plain", scopes=[]
        )
        try:
            resp = pg_client.post("/api/rally/v1/team/", json={"name": "Nope"})
        finally:
            app.dependency_overrides.pop(deps.get_participant, None)
            app.dependency_overrides.pop(api_nei_auth, None)

        assert resp.status_code == 403


class TestUpdateTeam:
    async def test_update_team_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Old Name")

        resp = pg_client.put(f"/api/rally/v1/team/{team.id}", json={"name": "New Name"})

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "New Name"

    async def test_update_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put("/api/rally/v1/team/999999", json={"name": "Whatever"})

        assert resp.status_code == 404

    async def test_update_team_forbidden_for_non_admin(self, pg_session, pg_client):
        from fastapi import HTTPException

        from app.api import deps
        from app.main import app

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Protected")

        def _raise_forbidden():
            raise HTTPException(status_code=403, detail="forbidden")

        app.dependency_overrides[deps.get_admin] = _raise_forbidden
        try:
            resp = pg_client.put(f"/api/rally/v1/team/{team.id}", json={"name": "Hacked"})
        finally:
            app.dependency_overrides.pop(deps.get_admin, None)

        assert resp.status_code == 403


class TestDeleteTeam:
    async def test_delete_team_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Deletable")

        resp = pg_client.delete(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 200, resp.text
        assert resp.json()["message"] == "Team deleted successfully"

    async def test_delete_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete("/api/rally/v1/team/999999")

        assert resp.status_code == 404

    async def test_delete_team_with_members_rejected(self, pg_session, pg_client, as_admin):
        from app.crud.crud_user import user as crud_user
        from app.schemas.user import UserCreate

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Has Members")
        member = await crud_user.create(pg_session, obj_in=UserCreate(name="M"))
        member.team_id = team.id
        pg_session.add(member)
        await pg_session.commit()

        resp = pg_client.delete(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 400
        assert "Cannot delete team with members" in resp.json()["detail"]


class TestGetTeamEvaluations:
    async def test_evaluations_forbidden_without_permission(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Private")

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")

        assert resp.status_code == 403

    async def test_evaluations_accessible_by_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Visible")

        # `get_team_evaluations` uses the *optional* auth dependency, which
        # `as_admin` does not override (it only overrides the required
        # `api_nei_auth`); wire it explicitly for this test.
        app.dependency_overrides[api_nei_auth_optional] = app.dependency_overrides[api_nei_auth]
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")
        finally:
            app.dependency_overrides.pop(api_nei_auth_optional, None)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["evaluations"] == []
        assert body["total"] == 0

    async def test_evaluations_accessible_by_own_nei_user(self, pg_session, pg_client):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.main import app
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        team = await _make_team(pg_session, "OwnedByMe")
        user = DetailedUser(id=4, name="P", disabled=False, team_id=team.id, scopes=[])
        app.dependency_overrides[deps.get_current_user_optional] = lambda: user
        app.dependency_overrides[api_nei_auth] = lambda: AuthData(
            oidc_sub="p4", name="P", scopes=[]
        )
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")
        finally:
            app.dependency_overrides.pop(deps.get_current_user_optional, None)
            app.dependency_overrides.pop(api_nei_auth, None)

        assert resp.status_code == 200, resp.text

    async def test_evaluations_accessible_by_team_token(self, pg_session, pg_client):
        from app.tests.conftest import as_team

        await _make_event(pg_session)
        team = await _make_team(pg_session, "TokenTeam")

        with as_team(team.id, team.name):
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")

        assert resp.status_code == 200, resp.text

    async def test_evaluations_lists_completed_results_with_serialized_activity_and_team(
        self, pg_session, pg_client, as_admin
    ):
        from app.crud.crud_activity import activity as crud_activity
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.activity import ActivityCreate, ActivityType
        from app.schemas.checkpoint import CheckPointCreate

        await _make_event(pg_session)
        checkpoint = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        team = await _make_team(pg_session, "Scored")
        activity_obj = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act",
                activity_type=ActivityType.GENERAL,
                checkpoint_id=checkpoint.id,
                config={},
            ),
        )
        eval_url = f"/api/rally/v1/staff/teams/{team.id}/activities/{activity_obj.id}/evaluate"
        as_admin.staff_checkpoint_id = checkpoint.id
        resp = pg_client.post(eval_url, json={"result_data": {"assigned_points": 42}})
        assert resp.status_code == 200, resp.text

        from app.api.auth import api_nei_auth, api_nei_auth_optional
        from app.main import app

        app.dependency_overrides[api_nei_auth_optional] = app.dependency_overrides[api_nei_auth]
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")
        finally:
            app.dependency_overrides.pop(api_nei_auth_optional, None)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        evaluation = body["evaluations"][0]
        assert evaluation["team_id"] == team.id
        assert evaluation["activity"]["id"] == activity_obj.id
        assert evaluation["team"]["id"] == team.id
