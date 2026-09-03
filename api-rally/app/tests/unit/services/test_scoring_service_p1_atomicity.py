"""P1 regression tests for atomic score updates and off-path events."""

import pytest
from sqlalchemy import select as sa_select

from app.core.exceptions import RallyError
from app.crud.crud_team import team as crud_team
from app.events import ActivityResultUpdatedEvent
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.activity_types import ActivityType
from app.schemas.team import TeamCreate
from app.services.scoring_service import ScoringService

_checkpoint_order = 50_000


async def _make_team(db, name: str = "P1 Team") -> Team:
    return await crud_team.create(db, obj_in=TeamCreate(name=name))


async def _make_activity(db) -> Activity:
    global _checkpoint_order
    _checkpoint_order += 1

    checkpoint = CheckPoint(name=f"P1 CP {_checkpoint_order}", order=_checkpoint_order)
    db.add(checkpoint)
    await db.flush()

    activity = Activity(
        name="P1 Activity",
        activity_type=ActivityType.GENERAL.value,
        config={"min_points": 0, "max_points": 100},
        checkpoint_id=checkpoint.id,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def _make_result(
    db,
    *,
    team: Team,
    activity: Activity,
    score: float = 50,
) -> ActivityResult:
    result = ActivityResult(
        activity_id=activity.id,
        team_id=team.id,
        result_data={"assigned_points": score},
        final_score=score,
        is_completed=True,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)
    return result


async def _set_puke_penalty(db, points: int = 10) -> None:
    settings = (await db.scalars(sa_select(RallySettings))).first()
    if settings is None:
        settings = RallySettings()
        db.add(settings)
        await db.flush()
    settings.penalty_per_puke = points
    await db.commit()


async def test_apply_extra_shots_bonus_updates_result_and_team_total_in_same_write(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(pg_session, team=team, activity=activity)

    # Seed the persisted total before exercising the endpoint-specific path.
    await ScoringService(pg_session).update_team_scores(team.id)
    await pg_session.refresh(team)
    assert team.total == 50

    ok = await ScoringService(pg_session).apply_extra_shots_bonus(
        team.id,
        activity.id,
        extra_shots=2,
    )

    assert ok is True
    await pg_session.refresh(result)
    await pg_session.refresh(team)
    assert result.extra_shots == 2
    assert result.final_score == pytest.approx(52)
    assert team.total == 52


async def test_apply_penalty_updates_result_and_team_total_in_same_write(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(pg_session, team=team, activity=activity)

    await _set_puke_penalty(pg_session, 10)
    await ScoringService(pg_session).update_team_scores(team.id)
    await pg_session.refresh(team)
    assert team.total == 50

    ok = await ScoringService(pg_session).apply_penalty(
        team.id,
        activity.id,
        "vomit",
        1,
    )

    assert ok is True
    await pg_session.refresh(result)
    await pg_session.refresh(team)
    assert result.penalties["vomit"] == 10
    assert result.penalty_counts["vomit"] == 1
    assert result.final_score == pytest.approx(40)
    assert team.total == 40


@pytest.mark.parametrize("method_name", ["apply_extra_shots_bonus", "apply_penalty"])
async def test_special_score_edits_publish_activity_result_updated_off_path(
    pg_session,
    monkeypatch,
    method_name,
):
    team = await _make_team(pg_session, name=f"P1 {method_name}")
    activity = await _make_activity(pg_session)
    result = await _make_result(pg_session, team=team, activity=activity)

    if method_name == "apply_penalty":
        await _set_puke_penalty(pg_session, 10)

    # Force the exact production branch used when RECOMPUTE_OFF_PATH and
    # EVENTS_ENABLED are both true, without mutating process-global settings.
    monkeypatch.setattr(
        ScoringService,
        "_defer_recompute",
        property(lambda _self: True),
    )

    published = []

    async def fake_publish_event(event):
        published.append(event)

    monkeypatch.setattr(
        "app.services.scoring_service.publish_event",
        fake_publish_event,
    )

    service = ScoringService(pg_session)
    if method_name == "apply_extra_shots_bonus":
        ok = await service.apply_extra_shots_bonus(
            team.id,
            activity.id,
            extra_shots=2,
        )
    else:
        ok = await service.apply_penalty(
            team.id,
            activity.id,
            "vomit",
            1,
        )

    assert ok is True

    updated_events = [event for event in published if isinstance(event, ActivityResultUpdatedEvent)]
    assert len(updated_events) == 1

    event = updated_events[0]
    assert event.payload.result_id == result.id
    assert event.payload.team_id == team.id
    assert event.payload.activity_id == activity.id


@pytest.mark.parametrize("method_name", ["apply_extra_shots_bonus", "apply_penalty"])
async def test_special_score_edits_do_not_commit_source_result_before_commit_funnel(
    pg_session,
    monkeypatch,
    method_name,
):
    """A failure before the commit funnel's commit must not durably persist the edit.

    This catches the original two-transaction bug: previously the source
    ActivityResult had already been committed before team-score recomputation.
    """
    team = await _make_team(pg_session, name=f"P1 atomic {method_name}")
    activity = await _make_activity(pg_session)
    result = await _make_result(pg_session, team=team, activity=activity)

    if method_name == "apply_penalty":
        await _set_puke_penalty(pg_session, 10)

    service = ScoringService(pg_session)

    # Read the ids out before the failure: the rollback below expires every
    # loaded attribute, and re-reading one afterwards is a lazy load from sync
    # attribute access (MissingGreenlet under asyncio).
    team_id, activity_id, result_id = team.id, activity.id, result.id

    async def explode_before_commit():
        raise RuntimeError("classification failed")

    monkeypatch.setattr(service, "_reassign_team_ranks", explode_before_commit)

    # The commit funnel wraps whatever fails before its single commit in a
    # RallyError, so that is what reaches the caller.
    with pytest.raises(RallyError, match="classification failed"):
        if method_name == "apply_extra_shots_bonus":
            await service.apply_extra_shots_bonus(
                team_id,
                activity_id,
                extra_shots=2,
            )
        else:
            await service.apply_penalty(
                team_id,
                activity_id,
                "vomit",
                1,
            )

    # The failed transaction is still open on this session. Roll it back, then
    # verify the durable database state is still the pre-edit state. Under the
    # old implementation this rollback could not undo the first commit.
    await pg_session.rollback()

    durable_result = await pg_session.get(ActivityResult, result_id)
    durable_team = await pg_session.get(Team, team_id)

    assert durable_result is not None
    assert durable_team is not None
    assert durable_result.final_score == pytest.approx(50)
    assert durable_result.extra_shots in (None, 0)

    if method_name == "apply_penalty":
        assert not durable_result.penalties
        assert not durable_result.penalty_counts
