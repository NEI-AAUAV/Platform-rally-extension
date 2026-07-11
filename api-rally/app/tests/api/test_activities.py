"""API tests for Activities endpoints, against real Postgres."""
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate


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
