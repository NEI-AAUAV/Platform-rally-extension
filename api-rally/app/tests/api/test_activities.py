"""API tests for Activities endpoints, against real Postgres."""

from unittest.mock import AsyncMock, patch

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.crud.crud_versus import versus as crud_versus
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event
from app.tests.conftest import set_rally_settings


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order), commit=True
    )


async def _make_activity(pg_session, checkpoint_id, name="Test Activity"):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name=name,
            description="Test Description",
            activity_type=ActivityType.GENERAL,
            checkpoint_id=checkpoint_id,
            config={"max_points": 100, "min_points": 0},
            is_active=True,
        ),
    )


async def _make_team(pg_session, name="Team A"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


def _make_result(pg_client, team_id, activity_id, assigned_points=50):
    resp = pg_client.post(
        "/api/rally/v1/activities/results/",
        json={
            "activity_id": activity_id,
            "team_id": team_id,
            "result_data": {"assigned_points": assigned_points},
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestActivitiesAPI:
    async def test_create_activity_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/activities/",
            json={
                "name": "Test Activity",
                "description": "Test Description",
                "activity_type": "GeneralActivity",
                "checkpoint_id": checkpoint.id,
                "config": {"max_points": 100, "min_points": 0},
                "is_active": True,
            },
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Test Activity"

    async def test_get_activities_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.get("/api/rally/v1/activities/")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["activities"][0]["name"] == "Test Activity"

    async def test_get_activities_by_checkpoint(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)
        await _make_activity(pg_session, cp1.id, name="A1")
        await _make_activity(pg_session, cp2.id, name="A2")

        resp = pg_client.get(f"/api/rally/v1/activities/?checkpoint_id={cp1.id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["activities"][0]["name"] == "A1"

    async def test_get_activity_by_id_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.get(f"/api/rally/v1/activities/{act.id}")

        assert resp.status_code == 200
        assert resp.json()["id"] == act.id

    async def test_get_activity_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/activities/999999")

        assert resp.status_code == 404

    async def test_update_activity_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.put(
            f"/api/rally/v1/activities/{act.id}", json={"name": "Updated Activity"}
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Updated Activity"

    async def test_delete_activity_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.delete(f"/api/rally/v1/activities/{act.id}")

        assert resp.status_code == 200

    async def test_get_all_activity_results_empty(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/activities/results")

        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_activity_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put("/api/rally/v1/activities/999999", json={"name": "Nope"})

        assert resp.status_code == 404

    async def test_delete_activity_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete("/api/rally/v1/activities/999999")

        assert resp.status_code == 404

    async def test_get_all_activity_results_lists_results(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        _make_result(pg_client, team.id, act.id)

        resp = pg_client.get("/api/rally/v1/activities/results")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["team_id"] == team.id


class TestActivityResultsCRUD:
    async def test_create_activity_result_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)

        result = _make_result(pg_client, team.id, act.id)

        assert result["team_id"] == team.id
        assert result["activity_id"] == act.id

    async def test_create_activity_result_duplicate_rejected(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        _make_result(pg_client, team.id, act.id)

        resp = pg_client.post(
            "/api/rally/v1/activities/results/",
            json={
                "activity_id": act.id,
                "team_id": team.id,
                "result_data": {"assigned_points": 90},
            },
        )

        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    async def test_get_activity_result_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        resp = pg_client.get(f"/api/rally/v1/activities/results/{result['id']}")

        assert resp.status_code == 200
        assert resp.json()["id"] == result["id"]

    async def test_get_activity_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/activities/results/999999")

        assert resp.status_code == 404

    async def test_update_activity_result_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        resp = pg_client.put(
            f"/api/rally/v1/activities/results/{result['id']}",
            json={"result_data": {"assigned_points": 75}},
        )

        assert resp.status_code == 200, resp.text

    async def test_update_activity_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put(
            "/api/rally/v1/activities/results/999999",
            json={"result_data": {"assigned_points": 75}},
        )

        assert resp.status_code == 404


class TestExtraShotsAndPenalty:
    async def test_apply_extra_shots_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post("/api/rally/v1/activities/results/999999/extra-shots?extra_shots=2")

        assert resp.status_code == 404

    async def test_apply_extra_shots_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        resp = pg_client.post(
            f"/api/rally/v1/activities/results/{result['id']}/extra-shots?extra_shots=1"
        )

        assert resp.status_code == 200, resp.text
        assert "successfully" in resp.json()["message"]

    async def test_apply_penalty_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/activities/results/999999/penalty?penalty_type=vomit&penalty_count=1"
        )

        assert resp.status_code == 404

    async def test_apply_penalty_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        resp = pg_client.post(
            f"/api/rally/v1/activities/results/{result['id']}/penalty"
            "?penalty_type=vomit&penalty_count=1"
        )

        assert resp.status_code == 200, resp.text
        assert "successfully" in resp.json()["message"]

    async def test_apply_penalty_failure_returns_400(self, pg_session, pg_client, as_admin):
        """`ScoringService.apply_penalty` returning False (e.g. a concurrent
        deletion race) surfaces as a 400, not a silent success."""
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        with patch(
            "app.api.api_v1.activities.ScoringService.apply_penalty",
            new=AsyncMock(return_value=False),
        ):
            resp = pg_client.post(
                f"/api/rally/v1/activities/results/{result['id']}/penalty"
                "?penalty_type=vomit&penalty_count=1"
            )

        assert resp.status_code == 400
        assert "Failed to apply penalty" in resp.json()["detail"]

    async def test_apply_extra_shots_over_limit_rejected(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        result = _make_result(pg_client, team.id, act.id)

        # Default max_extra_shots_per_member is 1 and this team has no
        # members recorded, so team_size falls back to 1 -> max_shots=1.
        resp = pg_client.post(
            f"/api/rally/v1/activities/results/{result['id']}/extra-shots?extra_shots=999"
        )

        assert resp.status_code == 400
        assert "Invalid extra shots" in resp.json()["detail"]

    async def test_apply_penalty_invalid_type_rejected_by_validation(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/activities/results/1/penalty?penalty_type=invalid&penalty_count=1"
        )

        assert resp.status_code == 422


class TestActivityRankingAndStatistics:
    async def test_get_activity_ranking_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/activities/999999/ranking")

        assert resp.status_code == 404

    async def test_get_activity_ranking_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        _make_result(pg_client, team.id, act.id)

        resp = pg_client.get(f"/api/rally/v1/activities/{act.id}/ranking")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["activity_id"] == act.id
        assert body["activity_name"] == act.name

    async def test_get_global_ranking(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        _make_result(pg_client, team.id, act.id)

        resp = pg_client.get("/api/rally/v1/activities/ranking/global")

        assert resp.status_code == 200, resp.text
        assert "rankings" in resp.json()
        assert "last_updated" in resp.json()

    async def test_get_activity_statistics_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/activities/999999/statistics")

        assert resp.status_code == 404

    async def test_get_activity_statistics_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        _make_result(pg_client, team.id, act.id)

        resp = pg_client.get(f"/api/rally/v1/activities/{act.id}/statistics")

        assert resp.status_code == 200, resp.text


class TestTeamVsResult:
    async def test_create_team_vs_result_success(self, pg_session, pg_client, as_admin):
        from app.schemas.activity import ActivityType as _ActivityType

        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Versus",
                activity_type=_ActivityType.TEAM_VS,
                checkpoint_id=checkpoint.id,
                config={},
            ),
        )
        team1 = await _make_team(pg_session, "Team1")
        team2 = await _make_team(pg_session, "Team2")
        # A TeamVs result is only accepted for the configured pairing: the
        # service checks the versus group, so the two teams have to be paired
        # before the match can be settled.
        await set_rally_settings(pg_session, enable_versus=True)
        await crud_versus.create_versus_pair(pg_session, team_a_id=team1.id, team_b_id=team2.id)
        await pg_session.commit()

        resp = pg_client.post(
            f"/api/rally/v1/activities/team-vs/{act.id}",
            params={
                "team1_id": team1.id,
                "team2_id": team2.id,
                "winner_id": team1.id,
            },
            json={"note": "close match"},
        )

        assert resp.status_code == 200, resp.text
        assert "successfully" in resp.json()["message"]


class TestActivitiesBusinessLogic:
    def test_activity_config_merge(self):
        from app.models.activity_factory import ActivityFactory

        default_config = ActivityFactory.get_default_config("GeneralActivity")
        assert default_config is not None
        assert "max_points" in default_config or "min_points" in default_config

    def test_activity_type_validation(self):
        from app.models.activity_factory import ActivityFactory

        valid_types = [
            "GeneralActivity",
            "TimeBasedActivity",
            "ScoreBasedActivity",
            "BooleanActivity",
            "TeamVsActivity",
        ]

        for activity_type in valid_types:
            config = ActivityFactory.get_default_config(activity_type)
            assert config is not None
