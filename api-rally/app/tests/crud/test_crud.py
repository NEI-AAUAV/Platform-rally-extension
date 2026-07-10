"""CRUD tests against a real Postgres schema (via the `pg_session` fixture).

Exercises actual SQL, constraints, and ARRAY columns instead of mocking the
CRUD layer — see app/tests/conftest.py::pg_session.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.models.checkpoint import CheckPoint
from app.schemas.rally_settings import RallySettingsUpdate
from app.schemas.user import UserCreate
from app.schemas.team import TeamCreate, TeamScoresUpdate, TeamUpdate


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    """RallySettingsUpdate requires every field (full-object PUT semantics);
    build it from the current row's values with the given overrides applied."""
    from app.schemas.rally_settings import RallySettingsResponse

    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _make_event(pg_session, **overrides):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True, **overrides)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _set_event_timing(pg_session, event, *, start_time, end_time):
    """rally_settings.get_or_create() re-syncs timing from the event's own
    start_time/end_time on every call (see crud_rally_settings._sync_timing_
    from_event), overwriting any direct edit to RallySettings.rally_*_time —
    so timing must be set on the event itself, not the settings row."""
    event.start_time = start_time
    event.end_time = end_time
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, event_id: int, order: int = 1) -> CheckPoint:
    checkpoint = CheckPoint(name=f"Checkpoint {order}", order=order, event_id=event_id)
    pg_session.add(checkpoint)
    await pg_session.commit()
    await pg_session.refresh(checkpoint)
    return checkpoint


class TestRallySettingsCRUD:
    async def test_get_or_create_settings_creates_row(self, pg_session):
        await _make_event(pg_session)

        settings = await rally_settings.get_or_create(pg_session)

        assert settings.id is not None
        assert settings.max_members_per_team > 0

    async def test_get_or_create_settings_returns_existing(self, pg_session):
        await _make_event(pg_session)

        first = await rally_settings.get_or_create(pg_session)
        second = await rally_settings.get_or_create(pg_session)

        assert second.id == first.id

    async def test_update_settings(self, pg_session):
        await _make_event(pg_session)
        current = await rally_settings.get_or_create(pg_session)

        updated = await rally_settings.update(
            pg_session, id=current.id, obj_in=_settings_update(current, max_members_per_team=6)
        )

        assert updated.max_members_per_team == 6


class TestTeamCRUD:
    async def test_create_team(self, pg_session):
        await _make_event(pg_session)

        result = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        assert result.id is not None
        assert result.name == "Test Team"
        assert result.access_code  # generated on create

    async def test_get_team(self, pg_session):
        await _make_event(pg_session)
        created = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        result = await crud_team.get(pg_session, id=created.id)

        assert result.id == created.id
        assert result.name == "Test Team"

    async def test_get_team_not_found(self, pg_session):
        from app.exception import NotFoundException

        with pytest.raises(NotFoundException):
            await crud_team.get(pg_session, id=999999)

    async def test_get_teams(self, pg_session):
        await _make_event(pg_session)
        await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        result = await crud_team.get_multi(pg_session)

        assert len(result) == 1
        assert result[0].name == "Test Team"

    async def test_create_team_duplicate_name_in_event_raises(self, pg_session):
        await _make_event(pg_session)
        await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        with pytest.raises(Exception):
            await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

    async def test_update_team(self, pg_session):
        await _make_event(pg_session)
        created = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        updated = await crud_team.update(
            pg_session, id=created.id, obj_in=TeamUpdate(name="Renamed Team")
        )

        assert updated.name == "Renamed Team"

    async def test_delete_team(self, pg_session):
        await _make_event(pg_session)
        created = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        removed = await crud_team.remove(pg_session, id=created.id)

        assert removed.id == created.id
        with pytest.raises(Exception):
            await crud_team.get(pg_session, id=created.id)


class TestTeamCheckpointLogic:
    async def _setup_active_rally(self, pg_session):
        event = await _make_event(pg_session)
        now = datetime.now(timezone.utc)
        await _set_event_timing(
            pg_session, event, start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=1)
        )
        settings = await rally_settings.get_or_create(pg_session)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))
        checkpoint = await _make_checkpoint(pg_session, event_id=event.id, order=1)
        return event, settings, team, checkpoint

    async def test_add_checkpoint_success(self, pg_session):
        _, _, team, checkpoint = await self._setup_active_rally(pg_session)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=checkpoint.id, question_score=1, time_score=20, pukes=0, skips=0
        )

        result = await crud_team.add_checkpoint(
            pg_session, id=team.id, checkpoint_id=checkpoint.id, obj_in=checkpoint_data
        )

        assert len(result.time_scores) == 1
        assert result.time_scores[0] == 20
        assert result.question_scores[0] is True

    async def test_add_checkpoint_before_rally_start_raises(self, pg_session):
        event = await _make_event(pg_session)
        now = datetime.now(timezone.utc)
        await _set_event_timing(
            pg_session, event, start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2)
        )
        await rally_settings.get_or_create(pg_session)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))
        checkpoint = await _make_checkpoint(pg_session, event_id=event.id, order=1)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=checkpoint.id, question_score=1, time_score=20, pukes=0, skips=0
        )

        with pytest.raises(Exception):
            await crud_team.add_checkpoint(
                pg_session, id=team.id, checkpoint_id=checkpoint.id, obj_in=checkpoint_data
            )


class TestUserCRUD:
    async def test_create_user(self, pg_session):
        result = await crud_user.create(
            pg_session, obj_in=UserCreate(name="Test User", email="test@example.com")
        )

        assert result.id is not None
        assert result.name == "Test User"
        assert result.email == "test@example.com"

    async def test_get_user(self, pg_session):
        created = await crud_user.create(
            pg_session, obj_in=UserCreate(name="Test User", email="test@example.com")
        )

        result = await crud_user.get(pg_session, id=created.id)

        assert result.id == created.id
        assert result.name == "Test User"

    async def test_get_users(self, pg_session):
        await crud_user.create(
            pg_session, obj_in=UserCreate(name="Test User", email="test@example.com")
        )

        result = await crud_user.get_multi(pg_session)

        assert len(result) == 1
        assert result[0].email == "test@example.com"


class TestRallyDurationLogic:
    def test_rally_status_calculations(self):
        settings = {
            "rally_start_time": datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
            "rally_end_time": datetime(2024, 1, 15, 18, 0, 0, tzinfo=timezone.utc),
        }

        current_time = datetime(2024, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
        if current_time < settings["rally_start_time"]:
            status = "not_started"
        elif current_time > settings["rally_end_time"]:
            status = "ended"
        else:
            status = "active"

        assert status == "not_started"

    def test_team_duration_calculation(self):
        times = [
            datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            datetime(2024, 1, 15, 11, 0, 0, tzinfo=timezone.utc),
        ]

        duration = (times[1] - times[0]).total_seconds() if len(times) >= 2 else 0

        assert duration == 1800


class TestTimezoneHandling:
    def test_datetime_utc_handling(self):
        utc_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)

        assert utc_time.tzinfo is not None
        assert utc_time.tzinfo.utcoffset(utc_time).total_seconds() == 0

    def test_checkpoint_time_utc(self):
        checkpoint_time = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)

        assert checkpoint_time.tzinfo is not None
        assert checkpoint_time.tzinfo.utcoffset(checkpoint_time).total_seconds() == 0
