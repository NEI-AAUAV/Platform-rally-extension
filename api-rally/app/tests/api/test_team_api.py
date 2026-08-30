"""API tests for the core Team CRUD/listing endpoints (`app/api/api_v1/team.py`),
against real Postgres.
"""

from contextlib import contextmanager

from app.api import deps
from app.api.auth import AuthData, api_nei_auth, api_nei_auth_optional
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.main import app
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.schemas.user import DetailedUser
from app.tests.conftest import make_event as _make_event


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


async def _create_checkpoint(pg_session, name: str = "CP1", order: int = 1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=name, order=order), commit=True
    )


async def _create_activity(
    pg_session,
    checkpoint_id: int,
    name: str = "Act1",
    activity_type: ActivityType = ActivityType.GENERAL,
    is_active: bool = True,
    config: dict | None = None,
):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name=name,
            activity_type=activity_type,
            checkpoint_id=checkpoint_id,
            config=config or {},
            is_active=is_active,
        ),
    )


def _evaluate_activity(
    pg_client, as_admin, team_id: int, checkpoint_id: int, activity_id: int, points: int = 10
):
    as_admin.staff_checkpoint_id = checkpoint_id
    url = f"/api/rally/v1/staff/teams/{team_id}/activities/{activity_id}/evaluate"
    resp = pg_client.post(url, json={"result_data": {"assigned_points": points}})
    assert resp.status_code == 200, resp.text
    return resp


@contextmanager
def _as_participant_override(
    team_id: int | None = None,
    scopes: list[str] | None = None,
    user_id: int = 1,
    name: str = "P",
    sub: str = "p1",
):
    user = DetailedUser(id=user_id, name=name, disabled=False, team_id=team_id, scopes=scopes or [])
    auth = AuthData(oidc_sub=sub, name=name, scopes=scopes or [])
    app.dependency_overrides[deps.get_participant] = lambda: user
    app.dependency_overrides[deps.get_current_user_optional] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: auth
    app.dependency_overrides[api_nei_auth_optional] = lambda: auth
    try:
        yield user
    finally:
        app.dependency_overrides.pop(deps.get_participant, None)
        app.dependency_overrides.pop(deps.get_current_user_optional, None)
        app.dependency_overrides.pop(api_nei_auth, None)
        app.dependency_overrides.pop(api_nei_auth_optional, None)


@contextmanager
def _enable_optional_auth_from_required():
    app.dependency_overrides[api_nei_auth_optional] = app.dependency_overrides[api_nei_auth]
    try:
        yield
    finally:
        app.dependency_overrides.pop(api_nei_auth_optional, None)


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
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Mine")
        with _as_participant_override(team.id):
            resp = pg_client.get("/api/rally/v1/team/me")

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == team.id


class TestGetOwnTeamAccessCode:
    async def test_get_own_team_exposes_access_code(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Mine")
        with _as_participant_override(team.id):
            resp = pg_client.get("/api/rally/v1/team/me")

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] == team.access_code


class TestGetTeamById:
    @staticmethod
    def _as_user(team_id=None, scopes=None, name="U", sub="u1", user_id=1):
        user = DetailedUser(
            id=user_id, name=name, disabled=False, team_id=team_id, scopes=scopes or []
        )
        app.dependency_overrides[deps.get_current_user_optional] = lambda: user
        app.dependency_overrides[api_nei_auth_optional] = lambda: AuthData(
            oidc_sub=sub, name=name, scopes=scopes or []
        )

    @classmethod
    def _as_participant(cls, team_id):
        cls._as_user(team_id=team_id, name="P", sub="p1")

    @staticmethod
    def _as_team_token(team_id):
        """A team logged in with its access code: no OIDC identity at all."""
        from app.schemas.team_auth import TeamTokenData

        app.dependency_overrides[deps.get_current_team_optional] = lambda: TeamTokenData(
            team_id=team_id, team_name="T"
        )

    @staticmethod
    def _clear_overrides():
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
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Managed")
        self._as_user(scopes=["admin"], name="A", sub="a1", user_id=2)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] == team.access_code

    async def test_get_team_by_id_returns_access_code_to_staff(self, pg_session, pg_client):
        """Rally staff show the team its identity QR at a checkpoint and
        cross-check scanned codes, so they get the access code back.
        """
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Scanned")
        self._as_user(scopes=["rally-staff"], name="S", sub="s1", user_id=3)
        try:
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        assert resp.json()["access_code"] == team.access_code

    async def test_get_team_by_id_returns_access_code_to_staff(self, pg_session, pg_client):
        """Rally staff show the team its identity QR at a checkpoint and
        cross-check scanned codes, so they get the access code back.
        """
        from app.api import deps
        from app.api.auth import AuthData
        from app.schemas.user import DetailedUser

        await _make_event(pg_session)
        team = await _make_team(pg_session, "Scanned")
        staff = DetailedUser(id=3, name="S", disabled=False, team_id=None, scopes=["rally-staff"])
        app.dependency_overrides[deps.get_current_user_optional] = lambda: staff
        app.dependency_overrides[api_nei_auth_optional] = lambda: AuthData(
            oidc_sub="s1", name="S", scopes=["rally-staff"]
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
        cp1 = await _create_checkpoint(pg_session, name="CP1", order=1)
        cp2 = await _create_checkpoint(pg_session, name="CP2", order=2)
        team = await _make_team(pg_session, "Progressing")
        activity1 = await _create_activity(pg_session, checkpoint_id=cp1.id, name="Act1")
        # cp2 has no active activity -> counted done only once the team has an
        # arrival row for it.
        await _create_activity(
            pg_session, checkpoint_id=cp2.id, name="Act2Inactive", is_active=False
        )

        # Score+complete activity1 via the real evaluate endpoint (goes
        # through ScoringService, which sets is_completed and auto-checks the
        # team into cp1, so `team.times` gets one entry here).
        _evaluate_activity(pg_client, as_admin, team.id, cp1.id, activity1.id)

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Auto-advance on full-completion checks the team into cp1 *and* bumps
        # it straight to cp2 (team.times gets a second entry). That second
        # entry is only a "next post" pointer, not an arrival: cp2 has no
        # arrival row, so its no-active-activity branch does NOT count it as
        # done. cp1 is the last completed post and cp2 is the current one —
        # the team must still physically reach it.
        assert body["last_checkpoint_number"] == 1
        assert body["current_checkpoint_number"] == 2

    async def test_peddy_paper_next_post_shown_when_ahead_posts_have_no_activities(
        self, pg_session, pg_client, as_admin
    ):
        """Regression: a peddy-paper team that finished post 1 (its only post
        with an activity) and has posts 2 and 3 still to visit — neither with
        an activity, neither arrived at — must be pointed at post 2, not shown
        the finished card. Before the fix, team.times inflation from
        advance_team_to_next_checkpoint made both no-activity posts count as
        done and current_checkpoint_number went null.
        """
        await _make_event(pg_session)
        cp1 = await _create_checkpoint(pg_session, name="CP1", order=1)
        await _create_checkpoint(pg_session, name="CP2", order=2)
        await _create_checkpoint(pg_session, name="CP3", order=3)
        team = await _make_team(pg_session, "PeddyTeam")
        activity1 = await _create_activity(pg_session, checkpoint_id=cp1.id, name="Act1")

        _evaluate_activity(pg_client, as_admin, team.id, cp1.id, activity1.id)

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_checkpoint_number"] == 1
        assert body["current_checkpoint_number"] == 2

    async def test_get_team_by_id_checkpoint_progress_all_completed(self, pg_session, pg_client):
        """When every checkpoint counts as done, current is None (route finished)."""
        import datetime as dt

        from app.models.checkpoint_arrival import CheckpointArrival

        await _make_event(pg_session)
        only_cp = await _create_checkpoint(pg_session, name="OnlyCP", order=1)
        team = await _make_team(pg_session, "Finisher")
        team.times = [dt.datetime(2026, 1, 1)]
        pg_session.add(team)
        # A no-activity post only counts as done once the team has actually
        # arrived there — recorded as a CheckpointArrival row, not inferred
        # from team.times.
        pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=only_cp.id))
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
        await _make_event(pg_session)
        cp1 = await _create_checkpoint(pg_session, name="CP1", order=1)
        team = await _make_team(pg_session, "PartiallyDone")
        activity1 = await _create_activity(pg_session, checkpoint_id=cp1.id, name="Act1")
        await _create_activity(pg_session, checkpoint_id=cp1.id, name="Act2")

        _evaluate_activity(pg_client, as_admin, team.id, cp1.id, activity1.id)

        resp = pg_client.get(f"/api/rally/v1/team/{team.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Only one of cp1's two activities is scored -> not fully complete.
        assert body["last_checkpoint_number"] == 0
        assert body["current_checkpoint_number"] == 1


class TestAddCheckpoint:
    async def test_add_checkpoint_success_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _create_checkpoint(pg_session, name="CP1", order=1)
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
        await _make_event(pg_session)
        with _as_participant_override(user_id=2, name="Plain", sub="p2"):
            resp = pg_client.post("/api/rally/v1/team/", json={"name": "Nope"})

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
        with _enable_optional_auth_from_required():
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["evaluations"] == []
        assert body["total"] == 0

    async def test_evaluations_accessible_by_own_nei_user(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "OwnedByMe")
        with _as_participant_override(team_id=team.id, user_id=4, sub="p4"):
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")

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
        await _make_event(pg_session)
        checkpoint = await _create_checkpoint(pg_session, name="CP1", order=1)
        team = await _make_team(pg_session, "Scored")
        activity_obj = await _create_activity(pg_session, checkpoint_id=checkpoint.id, name="Act")
        _evaluate_activity(pg_client, as_admin, team.id, checkpoint.id, activity_obj.id, points=42)

        with _enable_optional_auth_from_required():
            resp = pg_client.get(f"/api/rally/v1/team/{team.id}/evaluations")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        evaluation = body["evaluations"][0]
        assert evaluation["team_id"] == team.id
        assert evaluation["activity"]["id"] == activity_obj.id
        assert evaluation["team"]["id"] == team.id
