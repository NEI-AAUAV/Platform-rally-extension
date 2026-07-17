"""API tests for Staff Evaluation endpoints, against real Postgres.

Unit-level coverage of `validate_staff_checkpoint_access`, checkpoint
progression, and progress calculation now lives in
`test_staff_evaluation_utils.py` (migrated to real Postgres) — not duplicated
here.
"""
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import select
from unittest.mock import AsyncMock

from app.main import app
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.api.auth import api_nei_auth
from app.tests.conftest import _fake_auth_data, as_team
from app.models.activity import ActivityResult
import app.api.api_v1.staff_evaluation as staff_evaluation_module
from app.models.idempotency_key import IdempotencyKey

async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_activity(pg_session, checkpoint_id):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Activity", activity_type=ActivityType.GENERAL, checkpoint_id=checkpoint_id, config={}
        ),
    )


class TestStaffEvaluationAPI:
    async def test_get_teams_for_evaluation_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        await _make_team(pg_session, name="Team1")
        as_admin.staff_checkpoint_id = checkpoint.id

        resp = pg_client.get(f"/api/rally/v1/staff/teams?checkpoint_id={checkpoint.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["name"] == "Team1"

    async def test_get_teams_for_evaluation_no_checkpoint_assigned(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get("/api/rally/v1/staff/teams")

        assert resp.status_code == 404

    async def test_get_teams_for_evaluation_checkpoint_not_found(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        as_admin.staff_checkpoint_id = 999999

        resp = pg_client.get("/api/rally/v1/staff/teams")

        assert resp.status_code == 404


class TestMyCheckpointAPI:
    async def test_get_my_checkpoint_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id

        resp = pg_client.get("/api/rally/v1/staff/my-checkpoint")

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == checkpoint.id

    def test_get_my_checkpoint_no_checkpoint_assigned(
        self, pg_session, pg_client, as_admin
    ):
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get("/api/rally/v1/staff/my-checkpoint")

        assert resp.status_code == 404

    async def test_get_my_checkpoint_not_found(self, pg_session, pg_client, as_admin):
        as_admin.staff_checkpoint_id = 999999

        resp = pg_client.get("/api/rally/v1/staff/my-checkpoint")

        assert resp.status_code == 404


class TestTeamActivitiesForEvaluationAPI:
    async def test_get_team_activities_no_checkpoint_assigned(
        self, pg_session, pg_client, as_admin
    ):
        team_obj = await _make_team(pg_session, "TeamA")
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities"
        )

        assert resp.status_code == 404

    async def test_get_team_activities_team_not_found(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id

        resp = pg_client.get("/api/rally/v1/staff/teams/999999/activities")

        assert resp.status_code == 404

    async def test_get_team_activities_pending_and_completed(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity1 = await _make_activity(pg_session, checkpoint.id)
        activity2 = await _make_activity(pg_session, checkpoint.id)

        # Evaluate one of the two activities so the team has partial completion.
        eval_url = (
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"{activity1.id}/evaluate"
        )
        resp = pg_client.post(eval_url, json={"result_data": {"assigned_points": 50}})
        assert resp.status_code == 200, resp.text

        resp = pg_client.get(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["team"]["id"] == team_obj.id
        assert body["evaluation_summary"]["total_activities"] == 2
        assert body["evaluation_summary"]["completed_activities"] == 1
        assert body["evaluation_summary"]["has_incomplete"] is True
        assert activity2.name in body["evaluation_summary"]["missing_activities"]
        statuses = {a["id"]: a["evaluation_status"] for a in body["activities"]}
        assert statuses[activity1.id] == "completed"
        assert statuses[activity2.id] == "pending"


class TestEvaluateTeamActivityAuthzAPI:
    # Note: `validate_rally_permissions(auth)` inside `evaluate_team_activity`
    # (and the analogous checks in update/history/all-evaluations) use the
    # same `is_admin_or_staff` predicate as the `get_staff_with_checkpoint_access`
    # dependency the route already depends on. Any request that fails that
    # predicate is rejected by the dependency (403) before the route body's
    # own `validate_rally_permissions` check ever runs, so that in-body
    # branch is unreachable through the API and not exercised here.

    async def test_evaluate_staff_wrong_checkpoint_not_found(
        self, pg_session, pg_client, as_admin
    ):

        checkpoint = await _make_checkpoint(pg_session, order=1)
        other_checkpoint = await _make_checkpoint(pg_session, order=2)
        as_admin.staff_checkpoint_id = other_checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
            scopes=["rally-staff"]
        )
        try:
            resp = pg_client.post(
                f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
                f"{activity_obj.id}/evaluate",
                json={"result_data": {"assigned_points": 50}},
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
                scopes=["admin"]
            )
        assert resp.status_code == 404

    async def test_evaluate_admin_team_not_found(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/999999/activities/"
            f"{activity_obj.id}/evaluate",
            json={"result_data": {"assigned_points": 50}},
        )
        assert resp.status_code == 404

    async def test_evaluate_admin_activity_not_found(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"999999/evaluate",
            json={"result_data": {"assigned_points": 50}},
        )
        assert resp.status_code == 404


class TestConcurrentEvaluation:
    """Two staff submitting an evaluation for the same team/activity at once.

    `evaluate_team_activity` checks for an existing result then inserts a new
    one — a TOCTOU race two concurrent requests can both pass. A unique
    constraint on (activity_id, team_id) plus an IntegrityError fallback in
    `create_or_update_activity_result` closes it: the losing insert rolls
    back and updates the winner's row instead of duplicating it.
    """

    async def test_duplicate_submit_races_to_two_rows(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(pg_client.post, url, json=payload) for _ in range(2)]
            responses = [f.result() for f in futures]

        statuses = sorted(r.status_code for r in responses)
        assert all(s == 200 for s in statuses), [r.text for r in responses]

        rows = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).all()

        # The unique constraint + IntegrityError fallback collapses the race
        # to a single row: the losing request updates instead of duplicating.
        assert len(rows) == 1


class TestEvaluationSideEffectResilience:
    """Mirroring the versus result and advancing the team are best-effort side
    effects: if either raises, the evaluation itself still succeeds."""

    async def test_evaluate_succeeds_when_mirror_versus_result_raises(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):

        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        monkeypatch.setattr(
            staff_evaluation_module,
            "mirror_team_vs_result",
            AsyncMock(side_effect=RuntimeError("mirror boom")),
        )

        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        resp = pg_client.post(url, json={"result_data": {"assigned_points": 50}})

        assert resp.status_code == 200, resp.text

    async def test_evaluate_succeeds_when_check_and_advance_team_raises(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock

        import app.api.api_v1.staff_evaluation as staff_evaluation_module

        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        monkeypatch.setattr(
            staff_evaluation_module,
            "check_and_advance_team",
            AsyncMock(side_effect=RuntimeError("advance boom")),
        )

        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        resp = pg_client.post(url, json={"result_data": {"assigned_points": 50}})

        assert resp.status_code == 200, resp.text

    async def test_update_evaluation_succeeds_when_mirror_versus_result_raises(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        from unittest.mock import AsyncMock

        import app.api.api_v1.staff_evaluation as staff_evaluation_module

        team_obj, activity_obj, result_id = await _seed_result(pg_session, pg_client, as_admin)

        monkeypatch.setattr(
            staff_evaluation_module,
            "mirror_team_vs_result",
            AsyncMock(side_effect=RuntimeError("mirror boom")),
        )

        url = (
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"{activity_obj.id}/evaluate/{result_id}"
        )
        resp = pg_client.put(url, json={"result_data": {"assigned_points": 80}})

        assert resp.status_code == 200, resp.text


class TestEvaluationIdempotency:
    """`Idempotency-Key` header behavior on the evaluate endpoint."""

    async def _seed(self, pg_session):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)
        url = (
            f"/api/rally/v1/staff/teams/{team_obj.id}"
            f"/activities/{activity_obj.id}/evaluate"
        )
        return team_obj, activity_obj, url

    async def test_same_key_replays_without_reapplying(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, url = await self._seed(pg_session)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}
        headers = {"Idempotency-Key": "abc-123"}

        first = pg_client.post(url, json=payload, headers=headers)
        assert first.status_code == 200, first.text
        second = pg_client.post(url, json=payload, headers=headers)
        assert second.status_code == 200, second.text

        # Same response replayed…
        assert first.json()["final_score"] == second.json()["final_score"]

        # …and still exactly one result row (no double-apply).
        rows = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).all()
        assert len(rows) == 1

        keys = (
            await pg_session.scalars(
                select(IdempotencyKey).where(
                    IdempotencyKey.idempotency_key == "abc-123"
                )
            )
        ).all()
        assert len(keys) == 1

    async def test_same_key_different_payload_conflicts(
        self, pg_session, pg_client, as_admin
    ):
        _team, _activity, url = await self._seed(pg_session)
        headers = {"Idempotency-Key": "dup-key"}

        first = pg_client.post(
            url,
            json={"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}},
            headers=headers,
        )
        assert first.status_code == 200, first.text

        conflict = pg_client.post(
            url,
            json={"result_data": {"assigned_points": 90}, "extra_shots": 0, "penalties": {}},
            headers=headers,
        )
        assert conflict.status_code == 409, conflict.text

    async def test_no_key_behaves_normally(self, pg_session, pg_client, as_admin):
        _team, _activity, url = await self._seed(pg_session)
        resp = pg_client.post(
            url,
            json={"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}},
        )
        assert resp.status_code == 200, resp.text

        keys = (await pg_session.scalars(select(IdempotencyKey))).all()
        assert keys == []


async def _seed_result(pg_session, pg_client, as_admin):
    """Create a scored result via the API so it exists to edit/contest."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    as_admin.staff_checkpoint_id = checkpoint.id
    team_obj = await _make_team(pg_session, "TeamA")
    activity_obj = await _make_activity(pg_session, checkpoint.id)

    url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
    resp = pg_client.post(url, json={"result_data": {"assigned_points": 50}})
    assert resp.status_code == 200, resp.text
    return team_obj, activity_obj, resp.json()["id"]


class TestEvaluationHistoryAPI:
    async def test_edit_records_history_and_lists_it(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )

        # Edit the score -> should append one UPDATED history row.
        put_url = (
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"{activity_obj.id}/evaluate/{result_id}"
        )
        resp = pg_client.put(put_url, json={"result_data": {"assigned_points": 80}})
        assert resp.status_code == 200, resp.text

        hist_url = f"/api/rally/v1/staff/evaluations/{result_id}/history"
        resp = pg_client.get(hist_url)
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["action"] == "updated"
        assert rows[0]["editor_name"]  # editor recorded
        assert rows[0]["changes"]["final_score"]["after"] == 80

    async def test_history_forbidden_for_plain_staff(
        self, pg_session, pg_client, as_admin
    ):
        # Seed as admin, then demote auth to plain staff (no manager scope) and
        # confirm the history view is 403 — the trail is a managers-only tool.
        _team, _activity, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
            scopes=["rally-staff"]
        )
        try:
            resp = pg_client.get(
                f"/api/rally/v1/staff/evaluations/{result_id}/history"
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
                scopes=["admin"]
            )
        assert resp.status_code == 403

    async def test_team_can_contest_own_result(
        self, pg_session, pg_client, as_admin
    ):
        from app.tests.conftest import as_team

        team_obj, _activity, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )

        with as_team(team_obj.id, team_obj.name):
            resp = pg_client.post(
                f"/api/rally/v1/team-auth/evaluations/{result_id}/contest",
                json={"reason": "score is wrong, we scored 80"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["action"] == "contested"
        assert body["note"] == "score is wrong, we scored 80"

        # The contest shows up in the admin history view.
        resp = pg_client.get(f"/api/rally/v1/staff/evaluations/{result_id}/history")
        assert resp.status_code == 200
        assert any(r["action"] == "contested" for r in resp.json())

    async def test_team_cannot_contest_other_teams_result(
        self, pg_session, pg_client, as_admin
    ):

        _team, _activity, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )
        other = await _make_team(pg_session, "OtherTeam")

        with as_team(other.id, other.name):
            resp = pg_client.post(
                f"/api/rally/v1/team-auth/evaluations/{result_id}/contest",
                json={"reason": "not mine but let me try"},
            )
        # Same 404 as a missing result — don't leak other teams' result ids.
        assert resp.status_code == 404


class TestUpdateTeamActivityEvaluationAPI:
    # Note: as in TestEvaluateTeamActivityAuthzAPI, the in-body
    # `validate_rally_permissions` re-check, and the "staff with no
    # checkpoint" branch inside `_load_activity_and_team_for_update`, are
    # unreachable through the API because `get_staff_with_checkpoint_access`
    # already gates on the same conditions before the route body runs.

    async def test_update_staff_activity_not_at_checkpoint(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )
        other_checkpoint = await _make_checkpoint(pg_session, order=2)
        as_admin.staff_checkpoint_id = other_checkpoint.id

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
            scopes=["rally-staff"]
        )
        try:
            resp = pg_client.put(
                f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
                f"{activity_obj.id}/evaluate/{result_id}",
                json={"result_data": {"assigned_points": 80}},
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
                scopes=["admin"]
            )
        assert resp.status_code == 404

    async def test_update_team_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.put(
            f"/api/rally/v1/staff/teams/999999/activities/"
            f"{activity_obj.id}/evaluate/1",
            json={"result_data": {"assigned_points": 80}},
        )
        assert resp.status_code == 404

    async def test_update_result_not_found(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, _result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )

        resp = pg_client.put(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"{activity_obj.id}/evaluate/999999",
            json={"result_data": {"assigned_points": 80}},
        )
        assert resp.status_code == 404

    async def test_update_result_wrong_team_or_activity(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )
        other_team = await _make_team(pg_session, "OtherTeam")

        resp = pg_client.put(
            f"/api/rally/v1/staff/teams/{other_team.id}/activities/"
            f"{activity_obj.id}/evaluate/{result_id}",
            json={"result_data": {"assigned_points": 80}},
        )
        assert resp.status_code == 404


class TestEvaluationHistoryPermissionsAPI:
    # Note: as above, the in-body `validate_rally_permissions` re-check for
    # history is unreachable through the API for the same reason.

    async def test_history_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        resp = pg_client.get("/api/rally/v1/staff/evaluations/999999/history")
        assert resp.status_code == 404


class TestAllEvaluationsAPI:
    # Note: as above, the in-body `validate_rally_permissions` re-check for
    # all-evaluations is unreachable through the API for the same reason.

    async def test_all_evaluations_staff_without_checkpoint_forbidden(
        self, pg_session, pg_client, as_admin
    ):
        # The `get_staff_with_checkpoint_access` dependency itself rejects
        # staff without a checkpoint assignment (403) before the endpoint's
        # own body-level checkpoint check ever runs.
        as_admin.staff_checkpoint_id = None
        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
            scopes=["rally-staff"]
        )
        try:
            resp = pg_client.get("/api/rally/v1/staff/all-evaluations")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
                scopes=["admin"]
            )
        assert resp.status_code == 403

    async def test_all_evaluations_staff_restricted_to_own_checkpoint(
        self, pg_session, pg_client, as_admin
    ):
        _team, _activity, _result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )
        checkpoint_id = as_admin.staff_checkpoint_id

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
            scopes=["rally-staff"]
        )
        try:
            resp = pg_client.get("/api/rally/v1/staff/all-evaluations")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(
                scopes=["admin"]
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == len(body["evaluations"])
        assert checkpoint_id is not None

    async def test_all_evaluations_filter_by_team_id(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )

        resp = pg_client.get(
            f"/api/rally/v1/staff/all-evaluations?team_id={team_obj.id}"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["evaluations"][0]["team_id"] == team_obj.id
        assert body["evaluations"][0]["team"]["id"] == team_obj.id
        assert body["evaluations"][0]["activity"]["id"] == activity_obj.id

    async def test_all_evaluations_filter_by_checkpoint_id(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, result_id = await _seed_result(
            pg_session, pg_client, as_admin
        )
        checkpoint_id = as_admin.staff_checkpoint_id

        resp = pg_client.get(
            f"/api/rally/v1/staff/all-evaluations?checkpoint_id={checkpoint_id}"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] >= 1
        assert any(e["team_id"] == team_obj.id for e in body["evaluations"])
