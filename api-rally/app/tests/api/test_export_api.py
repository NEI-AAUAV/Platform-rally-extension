"""API tests for the event results export endpoint, against real Postgres."""

from io import BytesIO

import openpyxl
import pytest

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.team import Team

pytestmark = pytest.mark.asyncio

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _seed_event(pg_session) -> dict:
    """Create an event with two versus teams, two checkpoints and results."""
    event = RallyEvent(name="Rally Export", event_type="rally_tascas", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    cp1 = CheckPoint(name="CP1", order=1, event_id=event.id)
    cp2 = CheckPoint(name="CP2", order=2, event_id=event.id)
    team_a = Team(name="Alpha", access_code="EXP-A001", event_id=event.id, versus_group_id=1)
    team_b = Team(name="Bravo", access_code="EXP-B001", event_id=event.id, versus_group_id=1)
    pg_session.add_all([cp1, cp2, team_a, team_b])
    await pg_session.commit()
    for obj in (cp1, cp2, team_a, team_b):
        await pg_session.refresh(obj)

    act1 = Activity(
        name="Match CP1",
        activity_type="TeamVsActivity",
        checkpoint_id=cp1.id,
        event_id=event.id,
        config={},
    )
    act2 = Activity(
        name="Match CP2",
        activity_type="TeamVsActivity",
        checkpoint_id=cp2.id,
        event_id=event.id,
        config={},
    )
    pg_session.add_all([act1, act2])
    await pg_session.commit()
    for obj in (act1, act2):
        await pg_session.refresh(obj)

    pg_session.add_all(
        [
            ActivityResult(
                activity_id=act1.id,
                team_id=team_a.id,
                is_completed=True,
                final_score=6.0,
                extra_shots=5,
                penalties={"not_drinking": 1},
                result_data={"result": "win", "notes": "Objeto: pasta"},
                team_vs_result="win",
            ),
            ActivityResult(
                activity_id=act1.id,
                team_id=team_b.id,
                is_completed=True,
                final_score=3.0,
                extra_shots=0,
                penalties={"vomit": 5},
                result_data={"result": "lose"},
                team_vs_result="lose",
            ),
            ActivityResult(
                activity_id=act2.id,
                team_id=team_a.id,
                is_completed=True,
                final_score=3.0,
                result_data={"result": "lose"},
                team_vs_result="lose",
            ),
        ]
    )
    await pg_session.commit()

    return {"event": event, "team_a": team_a, "team_b": team_b}


async def test_export_requires_admin(pg_session, pg_client, as_user):
    seed = await _seed_event(pg_session)
    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/export")
    assert resp.status_code == 403


def test_export_event_not_found(pg_client, as_admin):
    resp = pg_client.get("/api/rally/v1/events/999999/export")
    assert resp.status_code == 404


async def test_export_returns_xlsx_with_expected_sheets(pg_session, pg_client, as_admin):
    seed = await _seed_event(pg_session)

    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/export")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == _XLSX_MEDIA_TYPE
    assert "attachment" in resp.headers["content-disposition"]
    assert "Rally_Export_results.xlsx" in resp.headers["content-disposition"]

    wb = openpyxl.load_workbook(BytesIO(resp.content))
    # Checkpoint sheets are named after the post; the side sheets for staff,
    # guides and the audit trails are absent because this event has none.
    assert wb.sheetnames == [
        "Overview",
        "Results",
        "Overall",
        "1. CP1",
        "2. CP2",
        "Checkpoints",
        "Activities",
        "Team Progress",
    ]


async def test_export_overall_scores_and_versus(pg_session, pg_client, as_admin):
    seed = await _seed_event(pg_session)

    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/export")
    wb = openpyxl.load_workbook(BytesIO(resp.content))
    rows = list(wb["Overall"].iter_rows(values_only=True))

    assert rows[0] == (
        "Team",
        "Versus Pair",
        "1. CP1",
        "2. CP2",
        "Checkpoint Subtotal",
        "Adjustments",
        "Recorded Total",
        "Rank",
    )
    # Teams ordered by name: Alpha then Bravo. The subtotal is a live formula,
    # and Bravo never reached CP2 so that cell is blank rather than a zero it
    # did not earn (openpyxl reads an empty string back as None).
    assert rows[1][:4] == ("Alpha", "Bravo", 6, 3)
    assert rows[1][4] == "=SUM(C2:D2)"
    assert rows[2][:4] == ("Bravo", "Alpha", 3, None)
    # `Team.total` is 0 here: this seed writes results directly without ever
    # running ScoringService, so nothing has recomputed the team totals.
    assert rows[1][6] == 0


async def test_export_checkpoint_detail_columns(pg_session, pg_client, as_admin):
    seed = await _seed_event(pg_session)

    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/export")
    wb = openpyxl.load_workbook(BytesIO(resp.content))
    rows = list(wb["1. CP1"].iter_rows(values_only=True))

    # These results carry only the priced `penalties` and no `penalty_counts`
    # (the shape of rows written before migration 0047), so those two columns
    # hold points and say so rather than reporting zero occurrences.
    assert rows[0] == (
        "Team",
        "Versus Pair",
        "Match Result",
        "Extra Shots",
        "Não bebeu (-pontos)",
        "Vómitos (-pontos)",
        "Notes",
        "Activity",
        "Activity Type",
        "Completed At",
        "Total Checkpoint",
    )
    assert rows[1][:7] == ("Alpha", "Bravo", "win", 5, 1, 0, "Objeto: pasta")
    assert rows[1][-1] == 6
    assert rows[2][:7] == ("Bravo", "Alpha", "lose", 0, 0, 5, None)
    assert rows[2][-1] == 3
    assert rows[3][0] == "Total"
