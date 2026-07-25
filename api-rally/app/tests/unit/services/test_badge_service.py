"""DB-backed tests for app.services.badge_service, none of which existed
before (evaluator tests always mock badge_holder_exists/team_has_badge)."""

from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate
from app.services import badge_service


async def _make_team(pg_session, name="Team A"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def test_badge_holder_exists_false_when_no_holder(pg_session):
    assert (
        await badge_service.badge_holder_exists(pg_session, "first_to_finish", activity_id=1)
        is False
    )


async def test_badge_holder_exists_true_after_award(pg_session):
    team = await _make_team(pg_session)
    await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="first_to_finish", activity_id=1
    )

    assert (
        await badge_service.badge_holder_exists(pg_session, "first_to_finish", activity_id=1)
        is True
    )


async def test_badge_holder_exists_scoped_by_checkpoint(pg_session):
    team = await _make_team(pg_session)
    await badge_service.award_badge(
        pg_session,
        team_id=team.id,
        badge_code="checkpoint_badge",
        activity_id=None,
        checkpoint_id=5,
    )

    assert (
        await badge_service.badge_holder_exists(
            pg_session, "checkpoint_badge", None, checkpoint_id=5
        )
        is True
    )
    assert (
        await badge_service.badge_holder_exists(
            pg_session, "checkpoint_badge", None, checkpoint_id=6
        )
        is False
    )


async def test_award_badge_is_idempotent_per_team(pg_session):
    team = await _make_team(pg_session)
    first = await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="dup_badge", activity_id=1
    )
    second = await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="dup_badge", activity_id=1
    )

    assert first is not None
    assert second is None
