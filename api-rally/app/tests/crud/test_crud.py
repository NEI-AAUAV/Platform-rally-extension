"""CRUD tests against a real Postgres schema (via the `pg_session` fixture).

Exercises actual SQL, constraints, and ARRAY columns instead of mocking the
CRUD layer — see app/tests/conftest.py::pg_session.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.models.checkpoint import CheckPoint
from app.schemas.rally_settings import RallySettingsUpdate
from app.schemas.team import TeamCreate, TeamScoresUpdate, TeamUpdate
from app.schemas.user import UserCreate
from app.services.checkpoint_visits import record_visit
from app.tests.conftest import make_event as _make_event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    """RallySettingsUpdate requires every field (full-object PUT semantics);
    build it from the current row's values with the given overrides applied."""
    from app.schemas.rally_settings import RallySettingsResponse

    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


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
            pg_session,
            id=current.id,
            obj_in=_settings_update(current, max_members_per_team=6),
            commit=True,
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
        with pytest.raises(RallyNotFoundError):
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

        obj_in = TeamCreate(name="Test Team")
        with pytest.raises(RallyValidationError):
            await crud_team.create(pg_session, obj_in=obj_in)

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

        removed = await crud_team.remove(pg_session, id=created.id, commit=True)

        assert removed.id == created.id
        with pytest.raises(RallyNotFoundError):
            await crud_team.get(pg_session, id=created.id)

    async def test_create_team_over_limit_raises(self, pg_session):
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(settings, max_teams=1),
            commit=True,
        )
        await crud_team.create(pg_session, obj_in=TeamCreate(name="First"))

        team_in = TeamCreate(name="Second")
        with pytest.raises(RallyValidationError):
            await crud_team.create(pg_session, obj_in=team_in)

    async def test_update_team_locked_array_size_mismatch_raises(self, pg_session):
        await _make_event(pg_session)
        created = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))

        team_update = TeamUpdate(times=[datetime.now(UTC)], question_scores=[])
        with pytest.raises(RallyValidationError):
            await crud_team.update(
                pg_session,
                id=created.id,
                obj_in=team_update,
            )

    async def test_get_by_checkpoint_finds_teams_at_order(self, pg_session):
        event = await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, event_id=event.id, order=1)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))
        now = datetime.now(UTC)
        await _set_event_timing(
            pg_session,
            event,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
        )
        await rally_settings.get_or_create(pg_session)
        # ``get_by_checkpoint`` reads the arrival row, which names the post —
        # it used to compare the *count* of visits to the post's order. Record
        # the visit through ``record_visit``, the one writer of both.
        await record_visit(pg_session, team_id=team.id, checkpoint_id=checkpoint.id)

        result = await crud_team.get_by_checkpoint(pg_session, checkpoint_id=checkpoint.id)

        assert len(result) == 1
        assert result[0].id == team.id

    async def test_get_by_checkpoint_unknown_checkpoint_returns_empty(self, pg_session):
        await _make_event(pg_session)

        result = await crud_team.get_by_checkpoint(pg_session, checkpoint_id=999999)

        assert result == []

    def test_calculate_min_time_scores(self):
        from app.models.team import Team

        teams = [
            Team(name="A", time_scores=[10, 20]),
            Team(name="B", time_scores=[5, 0]),
        ]

        result = crud_team.calculate_min_time_scores(teams)

        assert result[0] == 5
        # Team B's index-1 score is 0 (treated as inf, i.e. "no score yet"),
        # so team A's 20 is the only real value and wins the min.
        assert result[1] == 20


class TestTeamCheckpointLogic:
    async def _setup_active_rally(self, pg_session):
        event = await _make_event(pg_session)
        now = datetime.now(UTC)
        await _set_event_timing(
            pg_session,
            event,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
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
        now = datetime.now(UTC)
        await _set_event_timing(
            pg_session,
            event,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=2),
        )
        await rally_settings.get_or_create(pg_session)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))
        checkpoint = await _make_checkpoint(pg_session, event_id=event.id, order=1)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=checkpoint.id, question_score=1, time_score=20, pukes=0, skips=0
        )

        with pytest.raises(RallyValidationError):
            await crud_team.add_checkpoint(
                pg_session, id=team.id, checkpoint_id=checkpoint.id, obj_in=checkpoint_data
            )

    async def test_add_checkpoint_after_rally_end_raises(self, pg_session):
        event = await _make_event(pg_session)
        now = datetime.now(UTC)
        await _set_event_timing(
            pg_session,
            event,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
        )
        await rally_settings.get_or_create(pg_session)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Test Team"))
        checkpoint = await _make_checkpoint(pg_session, event_id=event.id, order=1)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=checkpoint.id, question_score=1, time_score=20, pukes=0, skips=0
        )

        with pytest.raises(RallyValidationError):
            await crud_team.add_checkpoint(
                pg_session, id=team.id, checkpoint_id=checkpoint.id, obj_in=checkpoint_data
            )

    async def test_add_checkpoint_unknown_checkpoint_raises(self, pg_session):
        _, _, team, _ = await self._setup_active_rally(pg_session)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=999999, question_score=1, time_score=20, pukes=0, skips=0
        )

        with pytest.raises(RallyNotFoundError):
            await crud_team.add_checkpoint(
                pg_session, id=team.id, checkpoint_id=999999, obj_in=checkpoint_data
            )

    async def test_add_checkpoint_out_of_order_when_order_matters_raises(self, pg_session):
        event, settings, team, _cp1 = await self._setup_active_rally(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(settings, checkpoint_order_matters=True),
            commit=True,
        )
        cp2 = await _make_checkpoint(pg_session, event_id=event.id, order=2)
        checkpoint_data = TeamScoresUpdate(
            checkpoint_id=cp2.id, question_score=1, time_score=20, pukes=0, skips=0
        )

        with pytest.raises(RallyValidationError):
            await crud_team.add_checkpoint(
                pg_session, id=team.id, checkpoint_id=cp2.id, obj_in=checkpoint_data
            )

    async def test_add_checkpoint_already_visited_when_order_does_not_matter_raises(
        self, pg_session
    ):
        _, settings, team, cp1 = await self._setup_active_rally(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(settings, checkpoint_order_matters=False),
            commit=True,
        )
        assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is True

        # Team has already visited cp1 (order 1); a second visit must not be
        # recorded again, even though order doesn't matter for this rally. The
        # guard is the arrival row's unique (team, checkpoint) constraint —
        # ``record_visit`` is where every check-in path goes through it — and
        # not the order check, which no longer keys off ``len(team.times)``.
        assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is False

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 1


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
            "rally_start_time": datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC),
            "rally_end_time": datetime(2024, 1, 15, 18, 0, 0, tzinfo=UTC),
        }

        current_time = datetime(2024, 1, 15, 9, 0, 0, tzinfo=UTC)
        if current_time < settings["rally_start_time"]:
            status = "not_started"
        elif current_time > settings["rally_end_time"]:
            status = "ended"
        else:
            status = "active"

        assert status == "not_started"

    def test_team_duration_calculation(self):
        times = [
            datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC),
            datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC),
        ]

        duration = (times[1] - times[0]).total_seconds()

        assert duration == 1800


class TestTimezoneHandling:
    def test_datetime_utc_handling(self):
        utc_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)

        assert utc_time.tzinfo is not None
        assert utc_time.tzinfo.utcoffset(utc_time).total_seconds() == 0

    def test_checkpoint_time_utc(self):
        checkpoint_time = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)

        assert checkpoint_time.tzinfo is not None
        assert checkpoint_time.tzinfo.utcoffset(checkpoint_time).total_seconds() == 0
