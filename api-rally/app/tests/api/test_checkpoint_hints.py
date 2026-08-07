"""Tests for the peddy-paper hint economy, against a real Postgres schema.

Covers the three rules that make the economy safe: a team may only buy hints
for the post it is currently hunting, a hint is charged exactly once no matter
how often the button is tapped, and the guide-only question/expected_answer
never leaves the server through a team route.
"""

from sqlalchemy import select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import EventType
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.dynamic_scoring import DynamicAward
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import as_team, make_event, make_team, set_rally_settings

HINTS_URL = "/api/rally/v1/checkpoint/{id}/hints"
HINT_URL = "/api/rally/v1/checkpoint/{id}/hint"


async def _make_event(pg_session):
    return await make_event(pg_session, name="Peddy Paper", event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order=1, event_id=None, clue=None):
    obj = await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Checkpoint {order}", order=order, latitude=41.0, longitude=-8.0, clue=clue
        ),
        commit=True,
    )
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _make_indications(pg_session, checkpoint_id, count=2):
    created = []
    for index in range(count):
        indication = CheckpointGuideIndication(
            checkpoint_id=checkpoint_id,
            hint=f"Pista {index + 1}",
            question="Em que ano foi construída?",
            expected_answer="1907",
            order=index,
        )
        pg_session.add(indication)
        created.append(indication)
    await pg_session.commit()
    for indication in created:
        await pg_session.refresh(indication)
    return created


async def test_reveal_returns_hints_in_ladder_order(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=2)
    await set_rally_settings(pg_session, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        first = pg_client.post(HINT_URL.format(id=checkpoint.id))
        second = pg_client.post(HINT_URL.format(id=checkpoint.id))

    assert first.status_code == 200, first.text
    assert first.json()["hint"] == "Pista 1"
    assert first.json()["remaining"] == 1
    assert second.json()["hint"] == "Pista 2"
    assert second.json()["remaining"] == 0


async def test_reveal_never_leaks_question_or_expected_answer(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)

    with as_team(team.id, "TeamA"):
        reveal = pg_client.post(HINT_URL.format(id=checkpoint.id))
        listing = pg_client.get(HINTS_URL.format(id=checkpoint.id))

    # The answer is guide-only: it must not appear anywhere on a team route.
    assert "1907" not in reveal.text
    assert "construída" not in reveal.text
    assert "1907" not in listing.text


async def test_running_out_of_hints_is_a_400(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=checkpoint.id))
        exhausted = pg_client.post(HINT_URL.format(id=checkpoint.id))

    assert exhausted.status_code == 400, exhausted.text


async def test_cannot_buy_hints_for_a_future_checkpoint(pg_session, pg_client):
    event = await _make_event(pg_session)
    await _make_checkpoint(pg_session, order=1, event_id=event.id)
    later = await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, later.id, count=1)
    await set_rally_settings(pg_session, checkpoint_order_matters=True)

    # The team has reached nothing yet, so post 2 is not theirs to hint on —
    # otherwise they could drain the whole route's hints and pre-solve it.
    with as_team(team.id, "TeamA"):
        resp = pg_client.post(HINT_URL.format(id=later.id))

    assert resp.status_code == 400, resp.text
    reveals = (await pg_session.scalars(select(CheckpointHintReveal))).all()
    assert reveals == []


async def test_penalty_is_charged_once_per_hint(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)
    await set_rally_settings(pg_session, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=checkpoint.id))
        # Second tap has nothing left to sell, so it must not bill again.
        pg_client.post(HINT_URL.format(id=checkpoint.id))

    awards = (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team.id))
    ).all()
    assert [award.points for award in awards] == [-10.0]


async def test_free_hints_create_no_award(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)
    await set_rally_settings(pg_session, hint_penalty=0)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(HINT_URL.format(id=checkpoint.id))

    assert resp.json()["cost"] == 0
    awards = (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team.id))
    ).all()
    assert awards == []


async def test_listing_returns_only_what_the_team_paid_for(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=3)
    await set_rally_settings(pg_session, hint_penalty=-5)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=checkpoint.id))
        listing = pg_client.get(HINTS_URL.format(id=checkpoint.id))

    data = listing.json()
    assert [item["hint"] for item in data["revealed"]] == ["Pista 1"]
    assert data["remaining"] == 2
    assert data["next_cost"] == -5


async def test_reveal_is_recorded_in_the_audit_log(pg_session, pg_client):
    from app.models.audit_log import AuditLog

    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)
    await set_rally_settings(pg_session, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=checkpoint.id))

    # A hint moves the score, so an admin investigating a dispute must see it.
    entries = (
        await pg_session.scalars(select(AuditLog).where(AuditLog.action == "hint.revealed"))
    ).all()
    assert len(entries) == 1
    assert "cost=-10" in (entries[0].note or "")


async def test_team_summary_totals_hints_across_checkpoints(pg_session, pg_client):
    event = await _make_event(pg_session)
    first = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    second = await _make_checkpoint(pg_session, order=2, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, first.id, count=1)
    await _make_indications(pg_session, second.id, count=1)
    await set_rally_settings(pg_session, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=first.id))
        # Advance to post 2 so its ladder becomes buyable.
        pg_client.post(
            f"/api/rally/v1/checkpoint/{first.id}/arrive",
            json={"latitude": 41.0, "longitude": -8.0},
        )
        pg_client.post(HINT_URL.format(id=second.id))
        summary = pg_client.get("/api/rally/v1/team-auth/hints")

    assert summary.status_code == 200, summary.text
    data = summary.json()
    # The per-checkpoint listing only covers one post; this is the only place
    # a team can see what the whole event's hints cost it.
    assert len(data["revealed"]) == 2
    assert data["total_spent"] == -20


async def test_team_summary_is_empty_before_any_hint(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)

    with as_team(team.id, "TeamA"):
        summary = pg_client.get("/api/rally/v1/team-auth/hints")

    assert summary.json() == {"revealed": [], "total_spent": 0}


async def test_the_switch_turns_hints_off_server_side(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=2)
    await set_rally_settings(pg_session, hints_enabled=False, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(HINT_URL.format(id=checkpoint.id))
        listing = pg_client.get(HINTS_URL.format(id=checkpoint.id))

    assert resp.status_code == 400, resp.text
    # Nothing left to buy, and nothing was bought.
    assert listing.json()["remaining"] == 0
    assert listing.json()["revealed"] == []


async def test_hints_bought_before_the_switch_stay_readable(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await make_team(pg_session, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=2)
    await set_rally_settings(pg_session, hint_penalty=-10)

    with as_team(team.id, "TeamA"):
        pg_client.post(HINT_URL.format(id=checkpoint.id))
        await set_rally_settings(pg_session, hints_enabled=False)
        listing = pg_client.get(HINTS_URL.format(id=checkpoint.id))

    # The team paid for this one; switching the mechanic off must not take it
    # back, only stop selling more.
    assert [item["hint"] for item in listing.json()["revealed"]] == ["Pista 1"]
    assert listing.json()["remaining"] == 0


async def test_hints_require_a_team_token(pg_session, pg_client):
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    await _make_indications(pg_session, checkpoint.id, count=1)

    resp = pg_client.post(HINT_URL.format(id=checkpoint.id))

    assert resp.status_code in (401, 403), resp.text
