"""DB-backed tests for CRUDRallyStaffAssignment (create_or_update,
get_by_checkpoint_id, get_multi_with_checkpoint) and CRUDRallyGuideAssignment
(create_or_update, get_by_team_id, get_multi_with_team) paths that aren't yet
exercised elsewhere."""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_guide_assignment import (
    rally_guide_assignment as crud_guide_assignment,
)
from app.crud.crud_rally_staff_assignment import (
    rally_staff_assignment as crud_staff_assignment,
)
from app.crud.crud_user import user as crud_user
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.user import UserCreate
from app.tests.conftest import make_event as _make_event
from app.tests.conftest import make_team as _make_team


async def _make_user(pg_session, name="Staffer"):
    return await crud_user.create(pg_session, obj_in=UserCreate(name=name))


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"CP{order}", order=order)
    )


class TestStaffAssignmentCreateOrUpdate:
    async def test_create_new_assignment(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        result = await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=checkpoint.id
        )
        assert result is not None
        assert result.checkpoint_id == checkpoint.id

    async def test_create_with_no_checkpoint_returns_none(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)

        result = await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=None
        )
        assert result is None

    async def test_update_existing_assignment_changes_checkpoint(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)

        await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=cp1.id
        )
        updated = await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=cp2.id
        )
        assert updated.checkpoint_id == cp2.id

    async def test_update_existing_assignment_removes_when_checkpoint_none(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)

        await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=cp1.id
        )
        result = await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=None
        )
        assert result is None

        remaining = await crud_staff_assignment.get_by_user_id(pg_session, user_id=user.id)
        assert remaining is None

    async def test_get_by_checkpoint_id(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=checkpoint.id
        )

        results = await crud_staff_assignment.get_by_checkpoint_id(
            pg_session, checkpoint_id=checkpoint.id
        )
        assert len(results) == 1
        assert results[0].user_id == user.id

    async def test_get_multi_with_checkpoint(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        await crud_staff_assignment.create_or_update(
            pg_session, user_id=user.id, checkpoint_id=checkpoint.id
        )

        results = await crud_staff_assignment.get_multi_with_checkpoint(pg_session)
        assert len(results) == 1
        assert results[0].checkpoint is not None


class TestGuideAssignmentCreateOrUpdate:
    async def test_create_new_assignment(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")
        team = await _make_team(pg_session)

        result = await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=team.id
        )
        assert result is not None
        assert result.team_id == team.id

    async def test_create_with_no_team_returns_none(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")

        result = await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=None
        )
        assert result is None

    async def test_update_existing_assignment_changes_team(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")
        team1 = await _make_team(pg_session, name="T1")
        team2 = await _make_team(pg_session, name="T2")

        await crud_guide_assignment.create_or_update(pg_session, user_id=user.id, team_id=team1.id)
        updated = await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=team2.id
        )
        assert updated.team_id == team2.id

    async def test_update_existing_assignment_removes_when_team_none(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")
        team1 = await _make_team(pg_session, name="T1")

        await crud_guide_assignment.create_or_update(pg_session, user_id=user.id, team_id=team1.id)
        result = await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=None
        )
        assert result is None

    async def test_get_by_team_id(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")
        team = await _make_team(pg_session)
        await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=team.id
        )

        results = await crud_guide_assignment.get_by_team_id(pg_session, team_id=team.id)
        assert len(results) == 1
        assert results[0].user_id == user.id

    async def test_get_multi_with_team(self, pg_session):
        await _make_event(pg_session)
        user = await _make_user(pg_session, name="Guide")
        team = await _make_team(pg_session)
        await crud_guide_assignment.create_or_update(
            pg_session, user_id=user.id, team_id=team.id
        )

        results = await crud_guide_assignment.get_multi_with_team(pg_session)
        assert len(results) == 1
        assert results[0].team is not None
