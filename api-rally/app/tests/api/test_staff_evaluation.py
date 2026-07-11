"""API tests for Staff Evaluation endpoints, against real Postgres.

Unit-level coverage of `validate_staff_checkpoint_access`, checkpoint
progression, and progress calculation now lives in
`test_staff_evaluation_utils.py` (migrated to real Postgres) — not duplicated
here.
"""
from concurrent.futures import ThreadPoolExecutor

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityType
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


async def _make_activity(pg_session, checkpoint_id):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Activity", activity_type=ActivityType.GENERAL, checkpoint_id=checkpoint_id, config={}
        ),
    )


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


class TestConcurrentEvaluation:
    """Two staff submitting an evaluation for the same team/activity at once.

    `evaluate_team_activity` checks for an existing result then inserts a new
    one — a TOCTOU race two concurrent requests can both pass. A unique
    constraint on (activity_id, team_id) plus an IntegrityError fallback in
    `create_or_update_activity_result` closes it: the losing insert rolls
    back and updates the winner's row instead of duplicating it.
    """

    async def test_duplicate_submit_races_to_two_rows(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team_obj = await _make_team(pg_session, "TeamA")
        activity_obj = await _make_activity(pg_session, checkpoint.id)

        url = f"/api/rally/v1/staff/teams/{team_obj.id}/activities/{activity_obj.id}/evaluate"
        payload = {"result_data": {"assigned_points": 50}, "extra_shots": 0, "penalties": {}}

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(pg_client.post, url, json=payload) for _ in range(2)]
            responses = [f.result() for f in futures]

        statuses = sorted(r.status_code for r in responses)
        assert all(s == 200 for s in statuses), [r.text for r in responses]

        from sqlalchemy import select
        from app.models.activity import ActivityResult

        rows = (
            await pg_session.scalars(
                select(ActivityResult).where(
                    ActivityResult.activity_id == activity_obj.id,
                    ActivityResult.team_id == team_obj.id,
                )
            )
        ).all()

        # The unique constraint + IntegrityError fallback collapses the race
        # to a single row: the losing request updates instead of duplicating.
        assert len(rows) == 1
