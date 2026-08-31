"""Tests for dynamic scoring endpoints (D4), against real Postgres."""

import pytest
from sqlalchemy import select

from app.crud.crud_team import team as crud_team
from app.models.team import Team
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


async def _reread_team(pg_session, team_id: int) -> Team:
    """Fresh SELECT bypassing pg_session's identity map — the award endpoint
    committed on a different session (pg_client), so a plain crud_team.get()
    here would return the stale pre-award instance without populate_existing.
    """
    stmt = select(Team).where(Team.id == team_id).execution_options(populate_existing=True)
    return (await pg_session.scalars(stmt)).one()


async def _make_team(pg_session, name="Team A"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


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
        json={"name": "Atraso no posto", "points": 10.0},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Atraso no posto"
    # rule_type is forced server-side: the only rule kind is a global penalty counter.
    assert resp.json()["rule_type"] == "penalty_counter"


async def test_update_rule(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "Bonus Rule", "points": 50.0},
    ).json()

    resp = pg_client.put(f"/api/rally/v1/dynamic-rules/{created['id']}", json={"points": 75.0})

    assert resp.status_code == 200
    assert resp.json()["points"] == pytest.approx(75.0)


async def test_update_rule_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.put("/api/rally/v1/dynamic-rules/999999", json={"points": 10.0})

    assert resp.status_code == 404


async def test_delete_rule(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "Bonus Rule", "points": 50.0},
    ).json()

    resp = pg_client.delete(f"/api/rally/v1/dynamic-rules/{created['id']}")

    assert resp.status_code == 204


async def test_delete_rule_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.delete("/api/rally/v1/dynamic-rules/999999")

    assert resp.status_code == 404


async def test_delete_rule_is_soft_delete_and_hidden_from_list(pg_session, pg_client, as_admin):
    """Regression: deleting a rule mustn't hard-delete the row — results
    already priced with its ``g_<id>`` key would lose their price on the next
    edit or retroactive recompute. It must still disappear from the active list.
    """
    await _make_event(pg_session)
    created = pg_client.post(
        "/api/rally/v1/dynamic-rules",
        json={"name": "Regra a apagar", "points": 20.0},
    ).json()

    resp = pg_client.delete(f"/api/rally/v1/dynamic-rules/{created['id']}")
    assert resp.status_code == 204

    listed = pg_client.get("/api/rally/v1/dynamic-rules")
    assert listed.status_code == 200
    assert all(rule["id"] != created["id"] for rule in listed.json())

    from app.models.dynamic_scoring import DynamicRule

    row = await pg_session.get(DynamicRule, created["id"])
    assert row is not None
    assert row.is_active is False


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
    assert resp.json()["points"] == pytest.approx(25.0)

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


async def test_delete_award_rejects_system_generated_excess_penalty_award(
    pg_session, pg_client, as_admin
):
    """M8 regression: a system-generated excess-penalty award (tied to an
    activity_result_id) used to accept a soft-delete that
    _sync_excess_penalty_award then silently undid on the next edit/reprice
    of that result — a "zombie" award the admin thought they'd removed."""
    from sqlalchemy import select

    from app.models.activity import Activity, ActivityResult
    from app.models.checkpoint import CheckPoint
    from app.models.dynamic_scoring import DynamicAward

    event = await _make_event(pg_session)
    cp = CheckPoint(name="CP1", order=1, event_id=event.id)
    pg_session.add(cp)
    await pg_session.flush()
    act = Activity(
        name="Act 1",
        activity_type="general",
        checkpoint_id=cp.id,
        event_id=event.id,
        config={"min_points": 0, "max_points": 100},
    )
    pg_session.add(act)
    await pg_session.flush()
    team = await _make_team(pg_session)
    res = ActivityResult(
        team_id=team.id,
        activity_id=act.id,
        is_completed=True,
        final_score=10,
        result_data={"assigned_points": 10},
    )
    pg_session.add(res)
    await pg_session.flush()

    pg_session.add(
        DynamicAward(
            team_id=team.id,
            activity_result_id=res.id,
            points=-60,
            reason="Penalização excedente: Some Activity",
            is_active=True,
        )
    )
    await pg_session.commit()

    award = (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team.id))
    ).one()

    resp = pg_client.delete(f"/api/rally/v1/dynamic-awards/{award.id}")

    assert resp.status_code == 400, resp.text
    await pg_session.refresh(award)
    assert award.is_active is True
