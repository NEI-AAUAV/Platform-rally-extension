"""Giving up on a checkpoint, against real Postgres.

The escape hatch: a team that cannot solve a riddle would otherwise sit at that
post for the rest of the event once the hint ladder runs out. Giving up costs
points and forfeits the post, but the route continues — including past a post
whose activity nobody will ever judge.
"""

from sqlalchemy import select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, EventType
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import as_team, make_event

SKIP_URL = "/api/rally/v1/checkpoint/{id}/skip"
ME_URL = "/api/rally/v1/checkpoint/me"


async def _make_event(pg_session):
    return await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order, event_id=None):
    obj = await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Tasca {order}",
            order=order,
            latitude=41.0,
            longitude=-8.0,
            clue=f"Enigma {order}",
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


async def test_giving_up_moves_the_team_to_the_next_post(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, skip_penalty=-25)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=first.id))
        nxt = pg_client.get(ME_URL).json()

    assert resp.status_code == 200, resp.text
    assert resp.json()["cost"] == -25
    assert resp.json()["next_checkpoint_order"] == 2
    # The point of the whole feature: the team is no longer stuck.
    assert nxt["order"] == 2


async def test_giving_up_gets_past_a_post_nobody_will_judge(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    pg_session.add(
        Activity(checkpoint_id=first.id, is_active=True, name="Prova", activity_type="generic")
    )
    await pg_session.commit()
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        pg_client.post(SKIP_URL.format(id=first.id))
        nxt = pg_client.get(ME_URL).json()

    # An unjudged activity normally blocks progression outright; a skipped post
    # is resolved rather than completed, so it stops blocking.
    assert nxt["order"] == 2


async def test_the_forfeit_is_charged_once(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, skip_penalty=-25)

    with as_team(team.id, "TeamA"):
        pg_client.post(SKIP_URL.format(id=first.id))
        again = pg_client.post(SKIP_URL.format(id=first.id))

    assert again.status_code == 400, again.text
    awards = (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team.id))
    ).all()
    assert [award.points for award in awards] == [-25.0]


async def test_a_free_forfeit_creates_no_award(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    await _set_settings(pg_session, skip_penalty=0)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=first.id))

    assert resp.json()["cost"] == 0
    awards = (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team.id))
    ).all()
    assert awards == []


async def test_cannot_give_up_on_a_post_the_team_has_not_reached(pg_session, pg_client):
    event = await _make_event(pg_session)
    await _make_checkpoint(pg_session, order=1, event_id=event.id)
    later = await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=later.id))

    # Otherwise a team could pay to fast-forward through the whole route.
    assert resp.status_code == 400, resp.text
    assert (await pg_session.scalars(select(CheckpointSkip))).all() == []


async def test_giving_up_on_the_last_post_ends_the_route(pg_session, pg_client):
    event = await _make_event(pg_session)
    only = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=only.id))

    assert resp.status_code == 200, resp.text
    assert resp.json()["next_checkpoint_order"] is None


async def test_skipping_requires_a_team_token(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)

    resp = pg_client.post(SKIP_URL.format(id=first.id))

    assert resp.status_code in (401, 403), resp.text
