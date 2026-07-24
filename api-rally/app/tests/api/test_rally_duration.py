"""API tests for rally duration endpoints, against real Postgres.

`RallyDurationCalculator` unit tests (pure date-math logic) stay elsewhere —
not migrated here, they don't touch DB/CRUD.
"""
from datetime import datetime, timedelta, timezone

from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


async def _activate_rally(pg_session, event):
    """rally_settings.rally_start_time/end_time are read-only in practice:
    `CRUDRallySettings.get_or_create` always overwrites them from the current
    event's start_time/end_time (`_sync_timing_from_event`), so writing the
    settings row directly is silently reverted on the next read. Set the
    event's timing instead — that's the actual source of truth.
    """
    now = datetime.now(timezone.utc)
    event.start_time = now - timedelta(hours=2)
    event.end_time = now + timedelta(hours=6)
    pg_session.add(event)
    await pg_session.commit()
    return await rally_settings.get_or_create(pg_session)


class TestRallyDurationAPI:
    async def test_get_rally_duration_success(self, pg_session, pg_client, as_admin):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)

        resp = pg_client.get("/api/rally/v1/rally/duration")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        assert "progress_percentage" in data

    async def test_get_team_rally_duration_success(self, pg_session, pg_client, as_admin):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
        # times is TIMESTAMP WITHOUT TIME ZONE — naive datetime required.
        team.times = [(datetime.now(timezone.utc) - timedelta(minutes=30)).replace(tzinfo=None)]
        pg_session.add(team)
        await pg_session.commit()

        resp = pg_client.get(f"/api/rally/v1/rally/team-duration/{team.id}")

        assert resp.status_code == 200
        data = resp.json()
        assert "team_duration" in data
        assert "is_within_rally_time" in data

    async def test_get_team_rally_duration_team_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/rally/team-duration/999999")

        assert resp.status_code == 404

    async def test_get_team_rally_duration_no_times(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="NoTimes"))

        resp = pg_client.get(f"/api/rally/v1/rally/team-duration/{team.id}")

        assert resp.status_code == 404
