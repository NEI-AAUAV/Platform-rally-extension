"""Proximity ("am I getting warmer?"), against real Postgres.

Every test here is really one question: does the aid help without handing over
the post? So the assertions are as much about what is *absent* from the
response — metres, coordinates, a bearing taken too early — as what is in it.
"""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.models.activity import EventType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import as_team, make_event

URL = "/api/rally/v1/checkpoint/{id}/proximity"

# The post everything is measured against.
POST_LAT = 41.0
POST_LON = -8.0


async def _make_event(pg_session):
    return await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order=1, event_id=None, lat=POST_LAT, lon=POST_LON):
    obj = await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Tasca {order}", order=order, latitude=lat, longitude=lon, arrival_radius_m=50
        ),
        commit=True,
    )
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _make_team(pg_session, event_id=None):
    obj = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"), commit=True)
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _set_settings(pg_session, **overrides):
    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data.update(overrides)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
    )


def _read(pg_client, checkpoint, lat, lon):
    return pg_client.post(URL.format(id=checkpoint.id), json={"latitude": lat, "longitude": lon})


async def test_disabled_by_default(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = _read(pg_client, checkpoint, POST_LAT, POST_LON)

    # An aid, not a default: an event has to opt in.
    assert resp.status_code == 400, resp.text


async def test_reports_a_band_and_never_a_metre_count(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    with as_team(team.id, "TeamA"):
        # ~250 m north of the post.
        resp = _read(pg_client, checkpoint, POST_LAT + 0.00225, POST_LON)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["band"] == "menos de 500m"
    # A precise distance read from a few positions trilaterates the post.
    assert "250" not in resp.text
    assert str(POST_LAT) not in resp.text
    assert str(POST_LON) not in resp.text


async def test_says_when_a_checkin_would_be_accepted(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    with as_team(team.id, "TeamA"):
        inside = _read(pg_client, checkpoint, POST_LAT + 0.00002, POST_LON)
        outside = _read(pg_client, checkpoint, POST_LAT + 0.02, POST_LON)

    assert inside.json()["is_within_radius"] is True
    assert outside.json()["is_within_radius"] is False


async def test_no_compass_unless_it_is_switched_on(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True, compass_enabled=False)

    with as_team(team.id, "TeamA"):
        resp = _read(pg_client, checkpoint, POST_LAT + 0.0002, POST_LON)

    assert resp.json()["direction"] is None


async def test_the_compass_stays_shut_outside_the_closest_band(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True, compass_enabled=True)

    with as_team(team.id, "TeamA"):
        # ~800 m away: a bearing from here would point straight at the answer.
        resp = _read(pg_client, checkpoint, POST_LAT + 0.0072, POST_LON)

    assert resp.json()["band"] == "menos de 2km"
    assert resp.json()["direction"] is None


async def test_the_compass_opens_once_the_team_is_already_there(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True, compass_enabled=True)

    with as_team(team.id, "TeamA"):
        # ~55 m south of the post, so the post is north of the team.
        resp = _read(pg_client, checkpoint, POST_LAT - 0.0005, POST_LON)

    assert resp.json()["band"] == "menos de 100m"
    # Inside this band the puzzle is solved; the compass only finds the door.
    assert resp.json()["direction"] == "N"


async def test_cannot_probe_a_post_further_down_the_route(pg_session, pg_client):
    event = await _make_event(pg_session)
    await _make_checkpoint(pg_session, order=1, event_id=event.id)
    later = await _make_checkpoint(pg_session, order=2, event_id=event.id, lat=41.5, lon=-8.5)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    with as_team(team.id, "TeamA"):
        resp = _read(pg_client, later, POST_LAT, POST_LON)

    # Otherwise a team maps the whole route from the start line.
    assert resp.status_code == 400, resp.text


async def test_a_post_without_coordinates_is_rejected(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name="Sem GPS", order=1), commit=True
    )
    checkpoint.event_id = event.id
    pg_session.add(checkpoint)
    await pg_session.commit()
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    with as_team(team.id, "TeamA"):
        resp = _read(pg_client, checkpoint, POST_LAT, POST_LON)

    assert resp.status_code == 400, resp.text


async def test_out_of_range_coordinates_are_rejected(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    with as_team(team.id, "TeamA"):
        resp = _read(pg_client, checkpoint, 200.0, POST_LON)

    assert resp.status_code == 422, resp.text


async def test_requires_a_team_token(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, event_id=event.id)
    await _set_settings(pg_session, proximity_enabled=True)

    resp = _read(pg_client, checkpoint, POST_LAT, POST_LON)

    assert resp.status_code in (401, 403), resp.text
