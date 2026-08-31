"""Giving up on a checkpoint, against real Postgres.

The escape hatch: a team that cannot solve a riddle would otherwise sit at that
post for the rest of the event once the hint ladder runs out. Giving up costs
points and forfeits the post, but the route continues — including past a post
whose activity nobody will ever judge.
"""

from sqlalchemy import select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import Activity, EventType
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import as_team, make_event, make_team, set_rally_settings

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


async def test_giving_up_moves_the_team_to_the_next_post(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await set_rally_settings(pg_session, skip_penalty=-25)

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
    team = await make_team(pg_session, event_id=event.id)

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
    team = await make_team(pg_session, event_id=event.id)
    await set_rally_settings(pg_session, skip_penalty=-25)

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
    team = await make_team(pg_session, event_id=event.id)
    await set_rally_settings(pg_session, skip_penalty=0)

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
    team = await make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=later.id))

    # Otherwise a team could pay to fast-forward through the whole route.
    assert resp.status_code == 400, resp.text
    assert (await pg_session.scalars(select(CheckpointSkip))).all() == []


async def test_can_give_up_on_the_post_being_hunted_after_an_advance(pg_session, pg_client):
    """Regression: ``team.times`` can hold more entries than the team has
    resolved posts, so a team hunting post 2 may already have two visits
    recorded. The reachability guard must key off resolved posts, not that
    count.
    """
    from datetime import UTC, datetime

    from app.models.checkpoint_arrival import CheckpointArrival

    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    second = await _make_checkpoint(pg_session, order=2, event_id=event.id)
    third = await _make_checkpoint(pg_session, order=3, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)

    now = datetime.now(UTC).replace(tzinfo=None)
    pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=first.id, arrived_at=now))
    team.times = [now, now]
    pg_session.add(team)
    await pg_session.commit()

    with as_team(team.id, "TeamA"):
        on_target = pg_client.post(SKIP_URL.format(id=second.id))
        too_far = pg_client.post(SKIP_URL.format(id=third.id))

    assert on_target.status_code == 200, on_target.text
    assert too_far.status_code == 400, too_far.text


async def test_can_give_up_current_post_with_a_later_post_resolved_ahead(pg_session, pg_client):
    """Regression: posts 1-3 resolved contiguously, post 5 given up earlier, so
    ``resolved_checkpoint_orders`` is ``{1,2,3,5}``. The old cardinality guard
    (``|resolved - {4}| == 3`` → ``4 == 3``) 400-ed post 4, the post the
    participant screen points the team at.
    """
    from datetime import UTC, datetime

    from app.models.checkpoint_arrival import CheckpointArrival

    event = await _make_event(pg_session)
    cps = [
        await _make_checkpoint(pg_session, order=order, event_id=event.id) for order in range(1, 6)
    ]
    team = await make_team(pg_session, event_id=event.id)
    await set_rally_settings(pg_session, checkpoint_order_matters=True)

    now = datetime.now(UTC).replace(tzinfo=None)
    for cp in cps[:3]:
        pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=cp.id, arrived_at=now))
    pg_session.add(CheckpointSkip(team_id=team.id, checkpoint_id=cps[4].id, cost=0))
    team.times = [now, now, now, now]
    pg_session.add(team)
    await pg_session.commit()

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=cps[3].id))

    assert resp.status_code == 200, resp.text


async def test_giving_up_on_the_last_post_ends_the_route(pg_session, pg_client):
    event = await _make_event(pg_session)
    only = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=only.id))

    assert resp.status_code == 200, resp.text
    assert resp.json()["next_checkpoint_order"] is None


async def test_the_switch_turns_giving_up_off_server_side(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    # A cost of 0 means "free"; this is the separate "off" knob.
    await set_rally_settings(pg_session, skip_enabled=False, skip_penalty=-25)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(SKIP_URL.format(id=first.id))

    # Hiding the button would not be enough — the endpoint has to refuse.
    assert resp.status_code == 400, resp.text
    assert (await pg_session.scalars(select(CheckpointSkip))).all() == []


async def test_skipping_requires_a_team_token(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)

    resp = pg_client.post(SKIP_URL.format(id=first.id))

    assert resp.status_code in (401, 403), resp.text
