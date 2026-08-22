"""Tests for staff_evaluation_utils, against real Postgres.

`serialize_activity`/`serialize_team`/`determine_current_order` are pure
dict-shaping functions with no DB access — kept as plain unit tests, not
migrated here.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.api.api_v1.staff_evaluation_utils import (
    advance_team_to_next_checkpoint,
    build_team_for_staff,
    check_and_advance_team,
    check_existing_result,
    checkin_team_to_checkpoint,
    checkpoint_has_activities,
    compute_checkpoint_progress,
    create_or_update_activity_result,
    determine_current_order,
    ensure_team_checkpoint_and_advance,
    is_checkpoint_completed,
    mirror_team_vs_result,
    serialize_activity,
    serialize_team,
    validate_admin_access,
    validate_staff_checkpoint_access,
)
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityResultEvaluation, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.services.scoring_service import ScoringService
from app.tests.conftest import make_event as _make_event


async def _activate_rally(pg_session, event):
    from app.crud.crud_rally_settings import rally_settings

    now = datetime.now(UTC)
    event.start_time = now - timedelta(hours=1)
    event.end_time = now + timedelta(hours=1)
    pg_session.add(event)
    await pg_session.commit()
    return await rally_settings.get_or_create(pg_session)


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_activity(pg_session, checkpoint_id, activity_type=ActivityType.GENERAL):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Activity", activity_type=activity_type, checkpoint_id=checkpoint_id, config={}
        ),
    )


def _staff_user(staff_checkpoint_id):
    from app.schemas.user import DetailedUser

    return DetailedUser(
        id=1,
        name="Staff",
        disabled=False,
        staff_checkpoint_id=staff_checkpoint_id,
        scopes=["rally-staff"],
    )


class TestValidateStaffCheckpointAccess:
    async def test_no_checkpoint_assigned_raises(self, pg_session):
        user = _staff_user(None)

        with pytest.raises(RallyForbiddenError) as exc:
            await validate_staff_checkpoint_access(pg_session, user, team_id=1, activity_id=1)

        assert exc.value.status_code == 403
        assert "No checkpoint assigned" in exc.value.message

    async def test_team_not_found_raises(self, pg_session):
        """crud.team.get() itself raises RallyNotFoundError (404) before
        validate_staff_checkpoint_access's own `if not team_obj` check (which
        is unreachable dead code as a result — team.get never returns None)."""
        user = _staff_user(1)

        with pytest.raises(RallyNotFoundError) as exc:
            await validate_staff_checkpoint_access(pg_session, user, team_id=999999, activity_id=1)

        assert exc.value.status_code == 404

    async def test_activity_not_at_staff_checkpoint_raises(self, pg_session):
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp2.id)
        user = _staff_user(cp1.id)

        with pytest.raises(RallyNotFoundError) as exc:
            await validate_staff_checkpoint_access(
                pg_session, user, team_id=team.id, activity_id=activity.id
            )

        assert "assigned checkpoint" in exc.value.message

    async def test_activity_not_found_raises(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        user = _staff_user(cp.id)

        with pytest.raises(RallyNotFoundError) as exc:
            await validate_staff_checkpoint_access(
                pg_session, user, team_id=team.id, activity_id=999999
            )

        assert "Activity not found" in exc.value.message

    async def test_staff_can_evaluate_regardless_of_team_progress(self, pg_session):
        """Staff can evaluate any team at their checkpoint, even ones not yet checked in."""
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)
        user = _staff_user(cp.id)

        team_obj, activity_obj = await validate_staff_checkpoint_access(
            pg_session, user, team_id=team.id, activity_id=activity.id
        )

        assert team_obj.id == team.id
        assert activity_obj.id == activity.id


class TestValidateAdminAccess:
    async def test_team_not_found(self, pg_session):
        """Same dead-code path as above: crud.team.get() raises RallyNotFoundError first."""
        with pytest.raises(RallyNotFoundError):
            await validate_admin_access(pg_session, team_id=999999, activity_id=1)

    async def test_activity_not_found(self, pg_session):
        team = await _make_team(pg_session)

        with pytest.raises(RallyNotFoundError):
            await validate_admin_access(pg_session, team_id=team.id, activity_id=999999)

    async def test_success(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        team_obj, activity_obj = await validate_admin_access(
            pg_session, team_id=team.id, activity_id=activity.id
        )

        assert team_obj.id == team.id
        assert activity_obj.id == activity.id


class TestCheckExistingResult:
    async def test_raises_when_result_exists(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)
        from app.models.activity import ActivityResult

        pg_session.add(ActivityResult(team_id=team.id, activity_id=activity.id, result_data={}))
        await pg_session.commit()

        with pytest.raises(RallyValidationError):
            await check_existing_result(pg_session, activity_id=activity.id, team_id=team.id)

    async def test_passes_when_no_result(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        await check_existing_result(pg_session, activity_id=activity.id, team_id=team.id)


class TestCheckpointProgression:
    async def test_checkin_team_to_checkpoint(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)

        await checkin_team_to_checkpoint(pg_session, team.id, cp.id)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 1

    async def test_advance_team_to_next_checkpoint(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp1 = await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        await checkin_team_to_checkpoint(pg_session, team.id, cp1.id)

        await advance_team_to_next_checkpoint(pg_session, team.id)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 2

    async def test_advance_team_to_next_checkpoint_no_next(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        await checkin_team_to_checkpoint(pg_session, team.id, cp.id)

        await advance_team_to_next_checkpoint(pg_session, team.id)  # no-op, no next checkpoint

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 1

    async def test_ensure_team_checkpoint_and_advance_checks_in_first(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp1 = await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)

        await ensure_team_checkpoint_and_advance(pg_session, team.id, cp1.id)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 2  # checked into cp1, then advanced to cp2

    async def test_check_and_advance_team_global_activity_never_advances(self, pg_session):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        from app.models.activity import Activity

        global_activity = Activity(
            name="Global",
            activity_type="GeneralActivity",
            checkpoint_id=None,
            config={},
            is_active=True,
        )

        await check_and_advance_team(pg_session, team.id, global_activity)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 0

    async def test_check_and_advance_team_advances_when_all_scored(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)
        from app.models.activity import ActivityResult

        result = ActivityResult(
            team_id=team.id, activity_id=activity.id, result_data={}, final_score=100
        )
        pg_session.add(result)
        await pg_session.commit()

        await check_and_advance_team(pg_session, team.id, activity)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 1

    async def test_check_and_advance_team_idempotent_when_already_past(self, pg_session):
        """Team already checked into checkpoint 2 (past checkpoint 1's order):
        re-evaluating a checkpoint-1 activity must not advance it again."""
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp1 = await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp1.id)

        await checkin_team_to_checkpoint(pg_session, team.id, cp1.id)
        await advance_team_to_next_checkpoint(pg_session, team.id)

        await check_and_advance_team(pg_session, team.id, activity)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 2  # unchanged, still just cp1 + cp2

    async def test_check_and_advance_team_no_scored_results(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        await check_and_advance_team(pg_session, team.id, activity)

        refreshed = await crud_team.get(pg_session, id=team.id)
        assert len(refreshed.times) == 0


class TestCheckpointProgressCalculation:
    async def test_checkpoint_has_activities(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)
        await _make_activity(pg_session, cp.id)

        assert await checkpoint_has_activities(pg_session, cp.id) is True

    async def test_checkpoint_has_activities_false(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)

        assert await checkpoint_has_activities(pg_session, cp.id) is False

    async def test_is_checkpoint_completed(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        assert await is_checkpoint_completed(pg_session, cp.id, {activity.id}) is True
        assert await is_checkpoint_completed(pg_session, cp.id, set()) is False

    async def test_compute_checkpoint_progress_all_completed(self, pg_session):
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        a1 = await _make_activity(pg_session, cp1.id)
        a2 = await _make_activity(pg_session, cp2.id)
        from app.models.activity import ActivityResult

        pg_session.add_all(
            [
                ActivityResult(
                    team_id=team.id, activity_id=a1.id, result_data={}, is_completed=True
                ),
                ActivityResult(
                    team_id=team.id, activity_id=a2.id, result_data={}, is_completed=True
                ),
            ]
        )
        await pg_session.commit()

        last, current, completed = await compute_checkpoint_progress(pg_session, team)

        assert last == 2
        # No post left to send them to — see determine_current_order.
        assert current is None
        assert completed == [1, 2]

    async def test_build_team_for_staff(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models.activity import ActivityResult
        from app.models.team import Team

        pg_session.add(
            ActivityResult(
                team_id=team.id, activity_id=activity.id, result_data={}, is_completed=True
            )
        )
        await pg_session.commit()

        team_with_members = (
            await pg_session.scalars(
                select(Team).where(Team.id == team.id).options(selectinload(Team.members))
            )
        ).one()

        result = await build_team_for_staff(pg_session, team_with_members, staff_checkpoint_order=1)

        assert result["id"] == team.id
        assert result["num_members"] == 0
        assert result["last_checkpoint_number"] == 1
        assert result["evaluated_at_current_checkpoint"] is True

    async def test_is_checkpoint_completed_no_activities(self, pg_session):
        """Checkpoint exists but has zero activities: not `all([])` (vacuously
        True) — an explicit early-return False so an empty checkpoint never
        counts as completed."""
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session)

        assert await is_checkpoint_completed(pg_session, cp.id, set()) is False

    async def test_compute_checkpoint_progress_stops_at_first_incomplete(self, pg_session):
        """Completed checkpoint 2 must not count if checkpoint 1 is incomplete
        (teams must complete in order) -- loop breaks instead of continuing."""
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        await _make_activity(pg_session, cp1.id)
        a2 = await _make_activity(pg_session, cp2.id)
        from app.models.activity import ActivityResult

        pg_session.add(
            ActivityResult(team_id=team.id, activity_id=a2.id, result_data={}, is_completed=True)
        )
        await pg_session.commit()

        last, current, completed = await compute_checkpoint_progress(pg_session, team)

        assert last == 0
        assert current == 1
        assert completed == []


class TestDetermineCurrentOrder:
    class _CP:
        def __init__(self, order):
            self.order = order

    def test_no_route_has_no_current_post(self):
        assert determine_current_order([], 0) is None

    def test_all_checkpoints_completed_has_no_current_post(self):
        """None, not the last post's order.

        Clamping to the last order is indistinguishable from a team still
        working on that post, and the participant screen builds its next-post
        card from this number — so a finished team was shown the post it had
        just completed as its "próximo posto" and never reached the finished
        card.
        """
        checkpoints = [self._CP(1), self._CP(2)]
        assert determine_current_order(checkpoints, 2) is None

    def test_mid_route_points_at_the_next_post(self):
        checkpoints = [self._CP(1), self._CP(2), self._CP(3)]
        assert determine_current_order(checkpoints, 1) == 2

    def test_a_team_that_has_started_nothing_is_sent_to_the_first_post(self):
        checkpoints = [self._CP(1), self._CP(2)]
        assert determine_current_order(checkpoints, 0) == 1


class TestSerializers:
    def test_serialize_activity_none_when_missing(self):
        class _Result:
            activity = None

        assert serialize_activity(_Result()) is None

    def test_serialize_team_none_when_missing(self):
        class _Result:
            team = None

        assert serialize_team(_Result()) is None

    def test_serialize_activity_present(self):
        class _Activity:
            id = 1
            name = "A"
            activity_type = "GeneralActivity"
            checkpoint_id = 2
            description = "desc"
            config = {}
            is_active = True

        class _Result:
            activity = _Activity()

        serialized = serialize_activity(_Result())
        assert serialized["id"] == 1
        assert serialized["name"] == "A"

    def test_serialize_team_present(self):
        class _Team:
            id = 1
            name = "T"
            total = 5
            members = [object(), object()]

        class _Result:
            team = _Team()

        serialized = serialize_team(_Result())
        assert serialized["num_members"] == 2


class TestCreateOrUpdateActivityResult:
    async def test_updates_existing_result(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        scoring_service = ScoringService(pg_session)
        first = await create_or_update_activity_result(
            pg_session,
            scoring_service,
            team.id,
            activity.id,
            ActivityResultEvaluation(result_data={"assigned_points": 10}),
        )
        assert first.result_data == {"assigned_points": 10}

        updated = await create_or_update_activity_result(
            pg_session,
            scoring_service,
            team.id,
            activity.id,
            ActivityResultEvaluation(result_data={"assigned_points": 20}),
        )

        assert updated.id == first.id
        assert updated.result_data == {"assigned_points": 20}

    async def test_integrity_error_race_recovers_via_existing_result(self, pg_session, monkeypatch):
        """Two concurrent evaluations for the same team+activity: the loser's
        INSERT hits a unique-constraint IntegrityError; it should roll back
        and fall through to updating the winner's row instead of failing."""
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        # Seed a "winner" result as if a concurrent request created it first.
        scoring_service = ScoringService(pg_session)
        winner = await create_or_update_activity_result(
            pg_session,
            scoring_service,
            team.id,
            activity.id,
            ActivityResultEvaluation(result_data={"assigned_points": 1}),
        )

        from sqlalchemy.exc import IntegrityError

        import app.api.api_v1.staff_evaluation_utils as utils_module

        async def _raise_integrity_error(*args, **kwargs):
            raise IntegrityError("dup", None, RuntimeError("duplicate key"))

        monkeypatch.setattr(utils_module, "create_activity_result", _raise_integrity_error)

        result = await create_or_update_activity_result(
            pg_session,
            scoring_service,
            team.id,
            activity.id,
            ActivityResultEvaluation(result_data={"assigned_points": 99}),
        )
        assert result.id == winner.id
        assert result.result_data == {"assigned_points": 99}

    async def test_integrity_error_without_existing_result_reraises(self, pg_session, monkeypatch):
        """If the IntegrityError wasn't actually a concurrent-insert race (no
        existing row is found after rollback), the original error must
        propagate rather than being silently swallowed."""
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        activity = await _make_activity(pg_session, cp.id)

        from sqlalchemy.exc import IntegrityError

        import app.api.api_v1.staff_evaluation_utils as utils_module

        async def _raise_integrity_error(*args, **kwargs):
            raise IntegrityError("dup", None, RuntimeError("some unrelated constraint"))

        monkeypatch.setattr(utils_module, "create_activity_result", _raise_integrity_error)

        eval_obj = ActivityResultEvaluation(result_data={"assigned_points": 5})
        scoring_service = ScoringService(pg_session)
        with pytest.raises(IntegrityError):
            await create_or_update_activity_result(
                pg_session, scoring_service, team.id, activity.id, eval_obj
            )


class TestMirrorTeamVsResult:
    async def test_no_op_for_non_versus_activity(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        activity = await _make_activity(pg_session, cp.id)  # GENERAL, not TeamVsActivity

        # Should simply return without raising or doing anything.
        await mirror_team_vs_result(
            pg_session,
            ScoringService(pg_session),
            activity,
            team_id=1,
            result_data={"opponent_team_id": 2, "result": "win"},
        )

    async def test_no_op_when_missing_opponent_or_result(self, pg_session):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        activity = await _make_activity(pg_session, cp.id, activity_type="TeamVsActivity")

        scoring_service = ScoringService(pg_session)
        await mirror_team_vs_result(
            pg_session, scoring_service, activity, team_id=1, result_data={}
        )
        await mirror_team_vs_result(
            pg_session,
            scoring_service,
            activity,
            team_id=1,
            result_data={"opponent_team_id": 2, "result": "invalid"},
        )

    async def test_mirrors_opposite_result_to_opponent(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp = await _make_checkpoint(pg_session, order=1)
        team_a = await _make_team(pg_session, name="A")
        team_b = await _make_team(pg_session, name="B")
        activity = await _make_activity(pg_session, cp.id, activity_type="TeamVsActivity")

        await mirror_team_vs_result(
            pg_session,
            ScoringService(pg_session),
            activity,
            team_id=team_a.id,
            result_data={"opponent_team_id": team_b.id, "result": "win"},
        )

        from app.crud.crud_activity import activity_result as crud_activity_result

        opponent_result = await crud_activity_result.get_by_activity_and_team(
            pg_session, activity.id, team_b.id
        )
        assert opponent_result is not None
        assert opponent_result.result_data["result"] == "lose"
        assert opponent_result.result_data["opponent_team_id"] == team_a.id


class TestCheckinAndAdvanceExceptionPaths:
    async def test_checkin_team_to_checkpoint_propagates_exception(self, pg_session):
        """Rally window set entirely in the future: `_validate_rally_timing`
        raises, exercising the `except Exception: log + raise` path."""
        from datetime import datetime, timedelta

        event = await _make_event(pg_session)
        now = datetime.now(UTC)
        event.start_time = now + timedelta(hours=1)
        event.end_time = now + timedelta(hours=2)
        pg_session.add(event)
        await pg_session.commit()

        cp = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)

        with pytest.raises(RallyValidationError):
            await checkin_team_to_checkpoint(pg_session, team.id, cp.id)

    async def test_advance_team_to_next_checkpoint_propagates_exception(self, pg_session):
        event = await _make_event(pg_session)
        await _activate_rally(pg_session, event)
        cp1 = await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        await checkin_team_to_checkpoint(pg_session, team.id, cp1.id)

        # Deactivate the rally window so the next add_checkpoint call fails
        # timing validation, exercising the except/raise path.

        event.start_time = datetime.now(UTC) + timedelta(hours=1)
        event.end_time = datetime.now(UTC) + timedelta(hours=2)
        pg_session.add(event)
        await pg_session.commit()

        with pytest.raises(RallyValidationError):
            await advance_team_to_next_checkpoint(pg_session, team.id)
