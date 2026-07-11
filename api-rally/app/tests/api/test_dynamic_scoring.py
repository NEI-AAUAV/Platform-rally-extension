"""Tests for dynamic scoring endpoints (D4), against real Postgres."""
from sqlalchemy import select

from app.crud.crud_team import team as crud_team
from app.models.team import Team
from app.schemas.team import TeamCreate


async def _reread_team(pg_session, team_id: int) -> Team:
    """Fresh SELECT bypassing pg_session's identity map — the award endpoint
    committed on a different session (pg_client), so a plain crud_team.get()
    here would return the stale pre-award instance without populate_existing.
    """
    stmt = select(Team).where(Team.id == team_id).execution_options(populate_existing=True)
    return (await pg_session.scalars(stmt)).one()


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_team(pg_session, name="Team A"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


# ---------- DynamicRule ----------


async def test_list_rules_empty(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.get("/api/rally/v1/dynamic-rules")

    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_rule(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "First Arrival", "points": 100.0, "rule_type": "bonus"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "First Arrival"


async def test_update_rule(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "Bonus Rule", "points": 50.0, "rule_type": "bonus"},
    ).json()

    resp = pg_client.put(f"/api/rally/v1/dynamic-rules/{created['id']}", json={"points": 75.0})

    assert resp.status_code == 200
    assert resp.json()["points"] == 75.0


async def test_update_rule_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.put("/api/rally/v1/dynamic-rules/999999", json={"points": 10.0})

    assert resp.status_code == 404


async def test_delete_rule(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "Bonus Rule", "points": 50.0, "rule_type": "bonus"},
    ).json()

    resp = pg_client.delete(f"/api/rally/v1/dynamic-rules/{created['id']}")

    assert resp.status_code == 204


async def test_delete_rule_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.delete("/api/rally/v1/dynamic-rules/999999")

    assert resp.status_code == 404


# ---------- DynamicAward ----------


async def test_list_awards(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    pg_client.post(
        "/api/rally/v1/dynamic-awards",
        json={"team_id": team.id, "points": 25.0, "reason": "nice"},
    )

    resp = pg_client.get("/api/rally/v1/dynamic-awards")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["team_id"] == team.id


async def test_create_award(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    team = await _make_team(pg_session)

    resp = pg_client.post(
        "/api/rally/v1/dynamic-awards",
        json={"team_id": team.id, "points": 25.0, "reason": "creativity"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["points"] == 25.0

    refreshed = await _reread_team(pg_session, team.id)
    assert refreshed.total == 25


async def test_delete_award(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-awards",
        json={"team_id": team.id, "points": 25.0, "reason": "nice"},
    ).json()

    resp = pg_client.delete(f"/api/rally/v1/dynamic-awards/{created['id']}")

    assert resp.status_code == 204
    listing = pg_client.get("/api/rally/v1/dynamic-awards", params={"team_id": team.id})
    assert listing.json() == []


async def test_delete_award_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.delete("/api/rally/v1/dynamic-awards/999999")

    assert resp.status_code == 404
