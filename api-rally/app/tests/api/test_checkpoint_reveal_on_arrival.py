"""Arriving reveals a post, even before its activity is scored.

Completion and arrival are different things. A post with an activity stays the
team's *current* post until staff submits a result, but the team is standing in
front of it the moment it checks in — so the reveal follows the arrival, while
progression still waits for the evaluation. Against real Postgres, driven
through the real GPS arrival endpoint.
"""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, EventType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import as_team, make_event

CHECKPOINTS_URL = "/api/rally/v1/checkpoint/"
ME_URL = "/api/rally/v1/checkpoint/me"


async def _make_event(pg_session):
    return await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order, lat=41.0, lon=-8.0):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Tasca Secreta {order}",
            order=order,
            latitude=lat,
            longitude=lon,
            arrival_radius_m=50,
            clue=f"Enigma {order}",
        ),
        commit=True,
    )


async def _make_activity(pg_session, checkpoint_id):
    activity = Activity(
        checkpoint_id=checkpoint_id, is_active=True, name="Prova", activity_type="generic"
    )
    pg_session.add(activity)
    await pg_session.commit()
    await pg_session.refresh(activity)
    return activity


async def _make_team(pg_session):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"), commit=True)


async def _enable_gps(pg_session):
    from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate

    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data.update(
        {
            "gps_checkin_enabled": True,
            "reveal_next_checkpoint": False,
            "show_route_mode": "complete",
        }
    )
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
    )


def _arrive(pg_client, checkpoint):
    return pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
        json={"latitude": 41.000045, "longitude": -8.0},
    )


async def test_post_with_an_activity_is_hidden_until_the_team_arrives(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        before = pg_client.get(CHECKPOINTS_URL).json()

    first = next(cp for cp in before if cp["order"] == 1)
    assert first["name"] == "Posto 1"
    assert first["latitude"] is None
    assert first["is_redacted"] is True
    # The riddle is all they get until they solve it.
    assert first["clue"] == "Enigma 1"


async def test_arriving_reveals_it_even_though_staff_has_not_scored_it(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        arrival = _arrive(pg_client, checkpoint)
        after = pg_client.get(CHECKPOINTS_URL).json()

    assert arrival.status_code == 200, arrival.text
    # The activity means no auto-complete: progression still waits for staff…
    assert arrival.json()["auto_completed"] is False

    first = next(cp for cp in after if cp["order"] == 1)
    # …but the place itself is no longer a secret from the team standing in it.
    assert first["name"] == "Tasca Secreta 1"
    assert first["latitude"] is not None
    assert first["is_redacted"] is False


async def test_arriving_reveals_it_through_checkpoint_me_too(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        _arrive(pg_client, checkpoint)
        me = pg_client.get(ME_URL).json()

    # /checkpoint/me is the shortcut around the list; same rule applies.
    assert me["name"] == "Tasca Secreta 1"
    assert me["is_redacted"] is False


async def test_arriving_unlocks_the_media_for_a_post_awaiting_evaluation(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        before = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/media")
        _arrive(pg_client, checkpoint)
        after = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/media")

    # Photos of the place are the reward for finding it, not for being scored.
    assert before.status_code == 403
    assert after.status_code == 200


async def test_the_switch_keeps_an_arrived_post_hidden(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate

    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data["reveal_on_arrival"] = False
    await rally_settings.update(
        pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
    )

    with as_team(team.id, "TeamA"):
        _arrive(pg_client, checkpoint)
        after = pg_client.get(CHECKPOINTS_URL).json()

    # An event that wants the reveal to wait for the evaluation can have that.
    first = next(cp for cp in after if cp["order"] == 1)
    assert first["is_redacted"] is True


async def test_arriving_does_not_reveal_the_next_post(pg_session, pg_client):
    await _make_event(pg_session)
    await _enable_gps(pg_session)
    first = await _make_checkpoint(pg_session, order=1)
    await _make_activity(pg_session, first.id)
    await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        _arrive(pg_client, first)
        after = pg_client.get(CHECKPOINTS_URL).json()

    second = next(cp for cp in after if cp["order"] == 2)
    # Reaching one post must not leak the answer to the next one.
    assert second["name"] == "Posto 2"
    assert second["latitude"] is None
    assert second["is_redacted"] is True
