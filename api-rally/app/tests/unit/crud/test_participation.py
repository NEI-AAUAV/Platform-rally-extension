"""Tests for participation recording (per-person event history), against real Postgres."""
from app.crud.crud_participation import CRUDParticipation
from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate


async def _make_event(pg_session, **overrides):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True, **overrides)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def test_record_creates_with_team_snapshot(pg_session):
    event = await _make_event(pg_session)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Os Bons"))
    crud = CRUDParticipation()

    row = await crud.record(
        pg_session, authentik_sub="sub-1", event_id=event.id, team=team, is_captain=True
    )

    assert row.authentik_sub == "sub-1"
    assert row.event_id == event.id
    assert row.team_id == team.id
    assert row.team_name == "Os Bons"
    assert row.team_total == team.total
    assert row.is_captain is True

    again = await crud.get_for_sub_and_event(
        pg_session, authentik_sub="sub-1", event_id=event.id
    )
    assert again is not None
    assert again.id == row.id


async def test_record_updates_existing_idempotent(pg_session):
    event = await _make_event(pg_session)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Os Bons"))
    crud = CRUDParticipation()

    first = await crud.record(pg_session, authentik_sub="sub-1", event_id=event.id, team=team)
    # `total` isn't exposed via TeamUpdate (it's computed by the scoring
    # flow); mutate it directly to simulate a score change between snapshots.
    team.total = 99
    pg_session.add(team)
    await pg_session.commit()
    await pg_session.refresh(team)
    updated_team = team

    second = await crud.record(
        pg_session, authentik_sub="sub-1", event_id=event.id, team=updated_team
    )

    assert second.id == first.id  # same row, not duplicated
    assert second.team_total == 99

    all_for_sub = await crud.get_for_sub(pg_session, authentik_sub="sub-1")
    assert len(all_for_sub) == 1


async def test_record_without_team_leaves_nulls(pg_session):
    event = await _make_event(pg_session)
    crud = CRUDParticipation()

    row = await crud.record(pg_session, authentik_sub="sub-2", event_id=event.id, team=None)

    assert row.team_id is None
    assert row.team_name is None
    assert row.team_total is None
