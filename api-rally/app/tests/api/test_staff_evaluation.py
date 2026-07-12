"""API tests for Staff Evaluation endpoints, against real Postgres.

Unit-level coverage of `validate_staff_checkpoint_access`, checkpoint
progression, and progress calculation now lives in
`test_staff_evaluation_utils.py` (migrated to real Postgres) — not duplicated
here.
"""
from concurrent.futures import ThreadPoolExecutor

from app.main import app
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate


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

        from sqlalchemy import select
        from app.models.activity import ActivityResult

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
        from sqlalchemy import select
        from app.models.activity import ActivityResult

        rows = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).all()
        assert len(rows) == 1

        # Exactly one idempotency row was recorded.
        from app.models.idempotency_key import IdempotencyKey

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

        from sqlalchemy import select
        from app.models.idempotency_key import IdempotencyKey

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

        from app.api.auth import api_nei_auth
        from app.tests.conftest import _fake_auth_data

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
        from app.tests.conftest import as_team

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
