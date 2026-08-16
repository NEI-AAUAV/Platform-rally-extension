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


def test_get_event_not_found(pg_client):
    resp = pg_client.get("/api/rally/v1/events/999999")

    assert resp.status_code == 404


def test_create_event(pg_client, as_admin):
    resp = pg_client.post("/api/rally/v1/events", json={"name": "New Edition"})

    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "New Edition"


async def test_update_event(pg_session, pg_client, as_admin):
    created = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Old"))

    resp = pg_client.put(f"/api/rally/v1/events/{created.id}", json={"name": "Renamed"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Renamed"


def test_update_event_not_found(pg_client, as_admin):
    resp = pg_client.put("/api/rally/v1/events/999999", json={"name": "Nope"})

    assert resp.status_code == 404


async def test_set_current_event(pg_session, pg_client, as_admin):
    created = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Switchable"))

    resp = pg_client.post(f"/api/rally/v1/events/{created.id}/set-current")

    assert resp.status_code == 200, resp.text
    assert resp.json()["is_current"] is True


def test_set_current_event_not_found(pg_client, as_admin):
    resp = pg_client.post("/api/rally/v1/events/999999/set-current")

    assert resp.status_code == 404


def test_rotation_schedule_event_not_found(pg_client, as_admin):
    resp = pg_client.post("/api/rally/v1/events/999999/rotation-schedule")

    assert resp.status_code == 404


async def test_rotation_schedule_rejects_non_olympic_event(pg_session, pg_client, as_admin):
    created = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Peddy", event_type=EventType.PEDDY_PAPER)
    )

    resp = pg_client.post(f"/api/rally/v1/events/{created.id}/rotation-schedule")

    assert resp.status_code == 400


async def test_rotation_schedule_rejects_when_no_teams_or_checkpoints(
    pg_session, pg_client, as_admin
):
    created = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Empty Olympic", event_type=EventType.OLYMPIC)
    )

    resp = pg_client.post(f"/api/rally/v1/events/{created.id}/rotation-schedule")

    assert resp.status_code == 400


async def test_rotation_schedule_generates_and_persists(pg_session, pg_client, as_admin):
    from app.crud.crud_team import team as crud_team
    from app.models.checkpoint import CheckPoint
    from app.schemas.team import TeamCreate

    created = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Real Olympic", event_type=EventType.OLYMPIC)
    )
    team_a = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team A"))
    team_a.event_id = created.id
    team_b = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team B"))
    team_b.event_id = created.id
    cp_a = CheckPoint(name="CP A", order=1, arrival_radius_m=50, event_id=created.id)
    cp_b = CheckPoint(name="CP B", order=2, arrival_radius_m=50, event_id=created.id)
    pg_session.add_all([team_a, team_b, cp_a, cp_b])
    await pg_session.commit()

    resp = pg_client.post(f"/api/rally/v1/events/{created.id}/rotation-schedule")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["event_id"] == created.id
    assert len(body["rounds"]) > 0
