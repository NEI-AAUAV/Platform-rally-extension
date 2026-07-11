"""API tests for the event (edition) endpoints, against real Postgres."""
from app.crud.crud_activity import rally_event
from app.models.activity import EventType
from app.schemas.activity import RallyEventCreate


async def test_list_events(pg_session, pg_client):
    await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Rally A"))
    await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Peddy B", event_type=EventType.PEDDY_PAPER)
    )

    resp = pg_client.get("/api/rally/v1/events")

    assert resp.status_code == 200
    body = resp.json()
    assert [e["name"] for e in body] == ["Peddy B", "Rally A"]  # newest first
    assert body[0]["event_type"] == "peddy_paper"


async def test_get_current_event(pg_session, pg_client):
    await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Now", is_current=True))

    resp = pg_client.get("/api/rally/v1/events/current")

    assert resp.status_code == 200
    assert resp.json()["name"] == "Now"


async def test_get_event_found(pg_session, pg_client):
    created = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Five"))

    resp = pg_client.get(f"/api/rally/v1/events/{created.id}")

    assert resp.status_code == 200
    assert resp.json()["id"] == created.id


async def test_get_event_not_found(pg_client):
    resp = pg_client.get("/api/rally/v1/events/999999")

    assert resp.status_code == 404
