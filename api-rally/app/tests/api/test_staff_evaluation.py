"""API tests for Staff Evaluation endpoints, against real Postgres.

Unit-level coverage of `validate_staff_checkpoint_access`, checkpoint
progression, and progress calculation now lives in
`test_staff_evaluation_utils.py` (migrated to real Postgres) — not duplicated
here.
"""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

import app.api.api_v1.staff_evaluation as staff_evaluation_module
from app.api.auth import api_nei_auth
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.main import app
from app.models.activity import ActivityResult
from app.models.idempotency_key import IdempotencyKey
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.services.scoring_service import ScoringService
from app.tests.conftest import _fake_auth_data, as_team
from app.tests.conftest import make_event as _make_event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order), commit=True
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


async def _make_activity(pg_session, checkpoint_id):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Activity",
            activity_type=ActivityType.GENERAL,
            checkpoint_id=checkpoint_id,
            config={},
        ),
    )


async def _scoreboard_row(pg_session, team_id: int) -> dict:
    ranking = await ScoringService(pg_session).get_team_ranking()
    row = next((item for item in ranking if item["team_id"] == team_id), None)
    assert row is not None
    return row


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

    async def test_get_teams_for_evaluation_no_checkpoint_assigned(
        self, pg_session, pg_client, as_admin
    ):
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

    def test_get_my_checkpoint_no_checkpoint_assigned(self, pg_session, pg_client, as_admin):
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get("/api/rally/v1/staff/my-checkpoint")

        assert resp.status_code == 404

    def test_get_my_checkpoint_not_found(self, pg_session, pg_client, as_admin):
        as_admin.staff_checkpoint_id = 999999

        resp = pg_client.get("/api/rally/v1/staff/my-checkpoint")

        assert resp.status_code == 404


class TestTeamActivitiesForEvaluationAPI:
    async def test_get_team_activities_no_checkpoint_assigned(
        self, pg_session, pg_client, as_admin
    ):
        team_obj = await _make_team(pg_session, "TeamA")
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get(f"/api/rally/v1/staff/teams/{team_obj.id}/activities")

        assert resp.status_code == 404

    async def test_get_team_activities_team_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id

        resp = pg_client.get("/api/rally/v1/staff/teams/999999/activities")

        assert resp.status_code == 404

    async def test_get_team_activities_pending_and_completed(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity1 = await _make_activity(pg_session, checkpoint.id)
        activity2 = await _make_activity(pg_session, checkpoint.id)

        # Evaluate one of the two activities so the team has partial completion.
        eval_url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity1.id}/evaluate"
        resp = pg_client.post(eval_url, json={"result_data": {"assigned_points": 50}})
        assert resp.status_code == 200, resp.text

        resp = pg_client.get(f"/api/rally/v1/staff/teams/{team_obj.id}/activities")
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

    async def _disable_staff_scoring(self, pg_session):
        from app.crud.crud_rally_settings import rally_settings

        cfg = await rally_settings.get_or_create(pg_session)
        cfg.enable_staff_scoring = False
        await pg_session.commit()

    async def test_evaluate_blocked_for_staff_when_scoring_disabled(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)
        await self._disable_staff_scoring(pg_session)

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.post(
                f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate",
                json={"result_data": {"assigned_points": 50}},
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 403

    async def test_evaluate_allowed_for_admin_when_scoring_disabled(
        self, pg_session, pg_client, as_admin
    ):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)
        await self._disable_staff_scoring(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate",
            json={"result_data": {"assigned_points": 50}},
        )
        assert resp.status_code in (200, 201), resp.text

    async def test_evaluate_staff_wrong_checkpoint_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        other_checkpoint = await _make_checkpoint(pg_session, order=2)
        as_admin.staff_checkpoint_id = other_checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.post(
                f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate",
                json={"result_data": {"assigned_points": 50}},
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 404

    async def test_evaluate_admin_team_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/999999/activities/{activity_obj.id}/evaluate",
            json={"result_data": {"assigned_points": 50}},
        )
        assert resp.status_code == 404

    async def test_evaluate_admin_activity_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "TeamA")

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/999999/evaluate",
            json={"result_data": {"assigned_points": 50}},
        )
        assert resp.status_code == 404


class TestPenaltyPricingIsServerSide:
    """The staff endpoint takes occurrence counts, never point totals.

    The client used to multiply the count by the configured price and submit
    the finished points, which meant the request body named its own deduction.
    """

    async def test_forged_penalties_field_cannot_reach_the_score(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "Forger")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate",
            json={
                "result_data": {"assigned_points": 50},
                "extra_shots": 0,
                # Not part of the schema any more: it must be ignored, not applied.
                "penalties": {"vomit": 9999},
            },
        )
        assert resp.status_code == 200

        row = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).first()
        assert row.penalties == {}
        assert row.final_score == 50

    async def test_counts_are_priced_from_settings(self, pg_session, pg_client, as_admin):
        from app.crud.crud_rally_settings import rally_settings

        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        team_obj = await _make_team(pg_session, "Priced")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        config = await rally_settings.get_or_create(pg_session)
        config.penalty_per_puke = -10
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate",
            json={
                "result_data": {"assigned_points": 50},
                "extra_shots": 0,
                "penalty_counts": {"vomit": 2},
            },
        )
        assert resp.status_code == 200

        row = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).first()
        assert row.penalty_counts == {"vomit": 2}
        assert row.penalties == {"vomit": 20}
        assert row.final_score == 30


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
        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        return team_obj, activity_obj, url

    async def test_same_key_replays_without_reapplying(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, url = await self._seed(pg_session)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}
        headers = {"Idempotency-Key": "abc-123"}

        first = pg_client.post(url, json=payload, headers=headers)
        assert first.status_code == 200, first.text
        await pg_session.refresh(team_obj)
        scoreboard_before = await _scoreboard_row(pg_session, team_obj.id)
        total_before = team_obj.total
        classification_before = team_obj.classification
        second = pg_client.post(url, json=payload, headers=headers)
        assert second.status_code == 200, second.text

        # Same response replayed…
        assert first.json() == second.json()

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
                select(IdempotencyKey).where(IdempotencyKey.idempotency_key == "abc-123")
            )
        ).all()
        assert len(keys) == 1
        await pg_session.refresh(team_obj)
        assert team_obj.total == total_before
        assert team_obj.classification == classification_before
        assert await _scoreboard_row(pg_session, team_obj.id) == scoreboard_before

    async def test_idempotent_evaluation_updates_total_classification_and_scoreboard(
        self, pg_session, pg_client, as_admin
    ):
        team_obj, activity_obj, url = await self._seed(pg_session)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}

        resp = pg_client.post(url, json=payload, headers={"Idempotency-Key": "eval-total-1"})
        assert resp.status_code == 200, resp.text

        result = await pg_session.scalar(
            select(ActivityResult).where(
                ActivityResult.activity_id == activity_obj.id,
                ActivityResult.team_id == team_obj.id,
            )
        )
        assert result is not None
        assert result.final_score == 50

        await pg_session.refresh(team_obj)
        assert team_obj.total == 50
        assert team_obj.classification == 1

        scoreboard_row = await _scoreboard_row(pg_session, team_obj.id)
        assert scoreboard_row["total_score"] == 50.0
        assert scoreboard_row["rank"] == 1

    async def test_time_ranking_recomputes_via_idempotent_staff_path(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_a = await _make_team(pg_session, "Team A")
        team_b = await _make_team(pg_session, "Team B")
        activity_obj = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Timed Activity",
                activity_type=ActivityType.TIME_BASED,
                checkpoint_id=checkpoint.id,
                config={"max_points": 100, "min_points": 10},
            ),
        )
        url_a = f"/api/rally/v1/staff/teams/{team_a.id}/activities/{activity_obj.id}/evaluate"
        url_b = f"/api/rally/v1/staff/teams/{team_b.id}/activities/{activity_obj.id}/evaluate"

        resp_a = pg_client.post(
            url_a,
            json={"result_data": {"completion_time_seconds": 10}, "extra_shots": 0},
            headers={"Idempotency-Key": "time-a"},
        )
        assert resp_a.status_code == 200, resp_a.text

        resp_b = pg_client.post(
            url_b,
            json={"result_data": {"completion_time_seconds": 5}, "extra_shots": 0},
            headers={"Idempotency-Key": "time-b"},
        )
        assert resp_b.status_code == 200, resp_b.text

        result_a = await pg_session.scalar(
            select(ActivityResult).where(
                ActivityResult.activity_id == activity_obj.id,
                ActivityResult.team_id == team_a.id,
            )
        )
        result_b = await pg_session.scalar(
            select(ActivityResult).where(
                ActivityResult.activity_id == activity_obj.id,
                ActivityResult.team_id == team_b.id,
            )
        )
        assert result_a is not None
        assert result_b is not None
        assert result_b.final_score == pytest.approx(100)
        assert result_a.final_score == pytest.approx(10)

        await pg_session.refresh(team_a)
        await pg_session.refresh(team_b)
        assert team_b.total == 100
        assert team_a.total == 10
        assert team_b.classification == 1
        assert team_a.classification == 2

        scoreboard = await ScoringService(pg_session).get_team_ranking()
        assert [row["team_id"] for row in scoreboard[:2]] == [team_b.id, team_a.id]
        assert scoreboard[0]["total_score"] == 100.0
        assert scoreboard[0]["rank"] == 1
        assert scoreboard[1]["total_score"] == 10.0
        assert scoreboard[1]["rank"] == 2

    async def test_same_key_different_payload_conflicts(self, pg_session, pg_client, as_admin):
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


class TestIdempotentEvaluationPublishesEventsAfterCommit:
    """P0: the idempotency transaction runs every domain write with commit=False,
    so its activity_result.*/team.score_updated events must be *staged* on the
    scoring service and published only once, after store_idempotent_response's
    single commit. Before this fix they were dropped entirely — DB state was
    right but SSE, caches, badges and the scoring worker never heard about it.
    """

    async def _seed(self, pg_session):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)
        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        return team_obj, activity_obj, url

    @staticmethod
    def _capture_events(monkeypatch) -> list:
        published: list = []
        monkeypatch.setattr(
            "app.services.scoring_service.publish_event",
            AsyncMock(side_effect=lambda event: published.append(event)),
        )
        return published

    async def test_normal_scoring_publishes_one_result_event_after_commit(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        team_obj, activity_obj, url = await self._seed(pg_session)
        published = self._capture_events(monkeypatch)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}

        resp = pg_client.post(url, json=payload, headers={"Idempotency-Key": "evt-normal-1"})
        assert resp.status_code == 200, resp.text

        result_events = [e for e in published if e.event_type.value == "activity_result.created"]
        assert len(result_events) == 1
        assert result_events[0].payload.team_id == team_obj.id
        assert result_events[0].payload.activity_id == activity_obj.id
        # A team.score_updated must also reach the leaderboard worker.
        assert any(e.event_type.value == "team.score_updated" for e in published)

        # The event describes committed state: the total is really persisted.
        await pg_session.refresh(team_obj)
        assert team_obj.total == 50

    async def test_off_path_stages_event_and_worker_recompute_fixes_total(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        # RECOMPUTE_OFF_PATH: the request persists the raw result and defers the
        # heavy recompute to the scoring worker, which is only ever woken by the
        # activity_result event. No event => Team.total stays wrong forever.
        monkeypatch.setattr(ScoringService, "_defer_recompute", property(lambda _: True))
        team_obj, activity_obj, url = await self._seed(pg_session)
        published = self._capture_events(monkeypatch)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}

        resp = pg_client.post(url, json=payload, headers={"Idempotency-Key": "evt-offpath-1"})
        assert resp.status_code == 200, resp.text

        # The worker's wake-up signal was published exactly once.
        result_events = [e for e in published if e.event_type.value == "activity_result.created"]
        assert len(result_events) == 1

        # Note: the scoring itself is deferred, but completing the post still
        # advances the team, and that append commits with its own classification
        # recompute (the P1 durability boundary), so team.total is not asserted
        # to be untouched here. What matters is that the event was published:
        # without it the worker never runs and any total it would fix is lost.

        # Drive the exact recompute ScoringWorker.handle_event performs off the
        # event, then the total is correct.
        worker_svc = ScoringService(pg_session)
        await worker_svc._recalculate_all_results_for_activity(result_events[0].payload.activity_id)
        await worker_svc.update_team_scores(result_events[0].payload.team_id)

        await pg_session.refresh(team_obj)
        assert team_obj.total == 50

    async def test_retry_same_key_replays_and_publishes_no_duplicate_events(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        team_obj, activity_obj, url = await self._seed(pg_session)
        published = self._capture_events(monkeypatch)
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}
        headers = {"Idempotency-Key": "evt-retry-1"}

        first = pg_client.post(url, json=payload, headers=headers)
        assert first.status_code == 200, first.text
        count_after_first = len(published)
        assert count_after_first >= 1

        second = pg_client.post(url, json=payload, headers=headers)
        assert second.status_code == 200, second.text
        assert second.json() == first.json()

        # The replay path returns before any domain write — zero new events.
        assert len(published) == count_after_first

    async def test_team_vs_idempotent_publishes_exactly_one_event_per_half(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_a = await _make_team(pg_session, "VS A")
        team_b = await _make_team(pg_session, "VS B")
        team_a.versus_group_id = team_a.id
        team_b.versus_group_id = team_a.id
        activity_obj = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Duel",
                activity_type=ActivityType.TEAM_VS,
                checkpoint_id=checkpoint.id,
                config={"win_points": 100, "draw_points": 50, "lose_points": 0},
            ),
        )
        await pg_session.commit()

        published = self._capture_events(monkeypatch)
        url = f"/api/rally/v1/staff/teams/{team_a.id}/activities/{activity_obj.id}/evaluate"
        resp = pg_client.post(
            url,
            json={"result_data": {"result": "win", "opponent_team_id": team_b.id}},
            headers={"Idempotency-Key": "evt-vs-1"},
        )
        assert resp.status_code == 200, resp.text

        result_events = [e for e in published if e.event_type.value.startswith("activity_result.")]
        teams_notified = sorted(e.payload.team_id for e in result_events)
        assert teams_notified == sorted([team_a.id, team_b.id]), (
            f"expected exactly one result event per match half, got {teams_notified}"
        )

    async def test_failure_before_final_commit_rolls_back_mutation_and_reservation(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """A crash/failure while finalizing the replay response must not leave
        either the scored result or an eternally in-flight reservation durable."""
        team_obj, activity_obj, url = await self._seed(pg_session)
        team_id = team_obj.id
        activity_id = activity_obj.id

        async def _fail_before_commit(db, reservation, *, response_body, status_code=200):
            await db.rollback()
            raise RuntimeError("simulated crash before atomic commit")

        monkeypatch.setattr(
            staff_evaluation_module, "store_idempotent_response", _fail_before_commit
        )

        with pytest.raises(RuntimeError, match="simulated crash"):
            pg_client.post(
                url,
                json={"result_data": {"assigned_points": 50}},
                headers={"Idempotency-Key": "crash-before-final-commit"},
            )

        pg_session.expire_all()
        result = await pg_session.scalar(
            select(ActivityResult).where(
                ActivityResult.activity_id == activity_id,
                ActivityResult.team_id == team_id,
            )
        )
        key = await pg_session.scalar(
            select(IdempotencyKey).where(
                IdempotencyKey.idempotency_key == "crash-before-final-commit"
            )
        )
        assert result is None
        assert key is None

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
    async def test_edit_records_history_and_lists_it(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, result_id = await _seed_result(pg_session, pg_client, as_admin)

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

    async def test_history_forbidden_for_plain_staff(self, pg_session, pg_client, as_admin):
        # Seed as admin, then demote auth to plain staff (no manager scope) and
        # confirm the history view is 403 — the trail is a managers-only tool.
        _team, _activity, result_id = await _seed_result(pg_session, pg_client, as_admin)

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.get(f"/api/rally/v1/staff/evaluations/{result_id}/history")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 403

    async def test_team_can_contest_own_result(self, pg_session, pg_client, as_admin):
        from app.tests.conftest import as_team

        team_obj, _activity, result_id = await _seed_result(pg_session, pg_client, as_admin)

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

    async def test_team_cannot_contest_other_teams_result(self, pg_session, pg_client, as_admin):
        _team, _activity, result_id = await _seed_result(pg_session, pg_client, as_admin)
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

    async def test_update_staff_activity_not_at_checkpoint(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, result_id = await _seed_result(pg_session, pg_client, as_admin)
        other_checkpoint = await _make_checkpoint(pg_session, order=2)
        as_admin.staff_checkpoint_id = other_checkpoint.id

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.put(
                f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
                f"{activity_obj.id}/evaluate/{result_id}",
                json={"result_data": {"assigned_points": 80}},
            )
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 404

    async def test_update_team_not_found(self, pg_session, pg_client, as_admin):
        checkpoint = await _make_checkpoint(pg_session, order=1)
        as_admin.staff_checkpoint_id = checkpoint.id
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.put(
            f"/api/rally/v1/staff/teams/999999/activities/{activity_obj.id}/evaluate/1",
            json={"result_data": {"assigned_points": 80}},
        )
        assert resp.status_code == 404

    async def test_update_result_not_found(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, _result_id = await _seed_result(pg_session, pg_client, as_admin)

        resp = pg_client.put(
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate/999999",
            json={"result_data": {"assigned_points": 80}},
        )
        assert resp.status_code == 404

    async def test_update_ignores_forged_penalties_and_is_completed(
        self, pg_session, pg_client, as_admin
    ):
        """Regression: the PUT body used to be validated against
        ActivityResultUpdate, which carries raw `penalties` (points, can be
        negative -> a self-awarded bonus) and `is_completed`. It's now
        ActivityResultStaffUpdate, which has neither field, so pydantic's
        default extra="ignore" silently drops them — the score must only
        move via `result_data`/`extra_shots`/`penalty_counts`.
        """
        team_obj, activity_obj, result_id = await _seed_result(pg_session, pg_client, as_admin)

        url = (
            f"/api/rally/v1/staff/teams/{team_obj.id}/activities/"
            f"{activity_obj.id}/evaluate/{result_id}"
        )
        resp = pg_client.put(
            url,
            json={
                "result_data": {"assigned_points": 50},
                "penalties": {"forged": -10000},
                "is_completed": False,
            },
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # The forged bonus never applied, and is_completed was ignored (the
        # result created by _seed_result is completed).
        assert body["final_score"] == pytest.approx(50)
        assert body.get("penalties", {}).get("forged") is None
        assert body["is_completed"] is True

    async def test_update_result_wrong_team_or_activity(self, pg_session, pg_client, as_admin):
        _, activity_obj, result_id = await _seed_result(pg_session, pg_client, as_admin)
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

    def test_all_evaluations_staff_without_checkpoint_forbidden(
        self, pg_session, pg_client, as_admin
    ):
        # The `get_staff_with_checkpoint_access` dependency itself rejects
        # staff without a checkpoint assignment (403) before the endpoint's
        # own body-level checkpoint check ever runs.
        as_admin.staff_checkpoint_id = None
        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.get("/api/rally/v1/staff/all-evaluations")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 403

    async def test_all_evaluations_staff_restricted_to_own_checkpoint(
        self, pg_session, pg_client, as_admin
    ):
        _team, _activity, _result_id = await _seed_result(pg_session, pg_client, as_admin)
        checkpoint_id = as_admin.staff_checkpoint_id

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.get("/api/rally/v1/staff/all-evaluations")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == len(body["evaluations"])
        assert checkpoint_id is not None

    async def test_all_evaluations_filter_by_team_id(self, pg_session, pg_client, as_admin):
        team_obj, activity_obj, _ = await _seed_result(pg_session, pg_client, as_admin)

        resp = pg_client.get(f"/api/rally/v1/staff/all-evaluations?team_id={team_obj.id}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["evaluations"][0]["team_id"] == team_obj.id
        assert body["evaluations"][0]["team"]["id"] == team_obj.id
        assert body["evaluations"][0]["activity"]["id"] == activity_obj.id

    async def test_all_evaluations_staff_checkpoint_clamp_survives_team_filter(
        self, pg_session, pg_client, as_admin
    ):
        # A staff caller passing `team_id` must still be clamped to their own
        # checkpoint — the filters are conjunctive, not either/or.
        team_obj, _, _ = await _seed_result(pg_session, pg_client, as_admin)
        other_checkpoint = await _make_checkpoint(pg_session, order=2)
        as_admin.staff_checkpoint_id = other_checkpoint.id

        app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["rally-staff"])
        try:
            resp = pg_client.get(f"/api/rally/v1/staff/all-evaluations?team_id={team_obj.id}")
        finally:
            app.dependency_overrides[api_nei_auth] = lambda: _fake_auth_data(scopes=["admin"])

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 0
        assert body["evaluations"] == []

    async def test_all_evaluations_filter_by_checkpoint_id(self, pg_session, pg_client, as_admin):
        team_obj, _, _ = await _seed_result(pg_session, pg_client, as_admin)
        checkpoint_id = as_admin.staff_checkpoint_id

        resp = pg_client.get(f"/api/rally/v1/staff/all-evaluations?checkpoint_id={checkpoint_id}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] >= 1
        assert any(e["team_id"] == team_obj.id for e in body["evaluations"])
