"""API tests for Staff Evaluation endpoints, against real Postgres.

Unit-level coverage of `validate_staff_checkpoint_access`, checkpoint
progression, and progress calculation now lives in
`test_staff_evaluation_utils.py` (migrated to real Postgres) — not duplicated
here.
"""
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


class TestStaffEvaluationAPI:
    async def test_get_teams_for_evaluation_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        await _make_team(pg_session, name="Team1")
        as_admin.staff_checkpoint_id = checkpoint.id

        resp = pg_client.get(f"/api/rally/v1/staff/teams?checkpoint_id={checkpoint.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["name"] == "Team1"

    async def test_get_teams_for_evaluation_no_checkpoint_assigned(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        as_admin.staff_checkpoint_id = None

        resp = pg_client.get("/api/rally/v1/staff/teams")

        assert resp.status_code == 404
