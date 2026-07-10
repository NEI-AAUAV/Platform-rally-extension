"""Checkpoint API tests against a real Postgres schema (pg_client + as_admin/as_user)."""
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.schemas.checkpoint import CheckPointCreate


async def _make_event(pg_session, **overrides):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True, **overrides)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order: int = 1):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order),
    )


class TestCheckpointListing:
    async def test_get_checkpoints_as_admin_returns_all(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert [cp["order"] for cp in body] == [1, 2]

    async def test_get_checkpoints_empty(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert response.json() == []

    async def test_get_checkpoints_count(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.get("/api/rally/v1/checkpoint/count")

        assert response.status_code == 200
        assert response.json() == 1


class TestCheckpointCRUDApi:
    async def test_create_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={
                "name": "New Checkpoint",
                "description": "New checkpoint description",
                "latitude": 40.7589,
                "longitude": -73.9851,
                "order": 1,
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["name"] == "New Checkpoint"
        assert body["order"] == 1

    async def test_create_checkpoint_duplicate_order_rejected(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={"name": "Dup", "order": 1},
        )

        assert response.status_code == 400

    async def test_create_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={"name": "New Checkpoint", "order": 1},
        )

        assert response.status_code == 403

    async def test_update_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.put(
            f"/api/rally/v1/checkpoint/{cp.id}",
            json={"name": "Updated Checkpoint", "description": "Updated description"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["name"] == "Updated Checkpoint"

    async def test_update_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.put(
            f"/api/rally/v1/checkpoint/{cp.id}", json={"name": "Nope"}
        )

        assert response.status_code == 403

    async def test_delete_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.delete(f"/api/rally/v1/checkpoint/{cp.id}")

        assert response.status_code == 200
        assert (await crud_checkpoint.get_multi(pg_session)) == []

    async def test_delete_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.delete(f"/api/rally/v1/checkpoint/{cp.id}")

        assert response.status_code == 403


class TestCheckpointBusinessLogic:
    """Pure validation logic — no DB, kept as-is."""

    def test_checkpoint_order_validation(self):
        checkpoints = [
            {"id": 1, "order": 1, "name": "First"},
            {"id": 2, "order": 2, "name": "Second"},
            {"id": 3, "order": 3, "name": "Third"},
        ]

        orders = [cp["order"] for cp in checkpoints]
        assert orders == sorted(orders)
        assert len(set(orders)) == len(orders)

    def test_checkpoint_coordinate_validation(self):
        valid_coordinates = [
            {"latitude": 40.7128, "longitude": -74.0060},
            {"latitude": 51.5074, "longitude": -0.1278},
            {"latitude": 35.6762, "longitude": 139.6503},
        ]

        for coord in valid_coordinates:
            assert -90 <= coord["latitude"] <= 90
            assert -180 <= coord["longitude"] <= 180
