"""DB-backed tests for ScoringService orchestration.

These cover the service methods that own scoring side effects (penalties,
extra shots, result create/update/remove, team-total recompute, rankings and
statistics). They complement the pure-math property tests in
test_scoring_properties.py, which never touch the database.

They run on the real-Postgres `pg_session` fixture (the ORM uses PG-only
column types, so the schema cannot be created on SQLite); with
RECOMPUTE_OFF_PATH off (the default), _defer_recompute is False, so the
synchronous scoring path is exercised end to end. The fixture auto-skips when
Postgres is unreachable.
"""

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.exceptions import RallyError, RallyValidationError
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.dynamic_scoring import DynamicAward
from app.models.team import Team
from app.schemas.activity import ActivityResultCreate, ActivityResultUpdate
from app.schemas.activity_types import ActivityType
from app.schemas.team import TeamCreate
from app.services.scoring_service import ScoringService


# --------------------------------------------------------------------------- #
# seeding helpers
# --------------------------------------------------------------------------- #
async def _make_team(db, name: str = "Team A") -> Team:
    # crud_team.create generates the required access_code and defaults.
    return await crud_team.create(db, obj_in=TeamCreate(name=name))


_checkpoint_order = 0


async def _make_activity(
    db,
    *,
    activity_type: str = ActivityType.GENERAL.value,
    config: dict | None = None,
    with_checkpoint: bool = True,
) -> Activity:
    # Most activities are checkpoint-scoped; that is what gives them a slot in
    # score_per_checkpoint. Pass with_checkpoint=False for a *global* activity
    # (D3): no slot, but its points still count toward team.total.
    checkpoint_id = None
    if with_checkpoint:
        global _checkpoint_order
        _checkpoint_order += 1
        checkpoint = CheckPoint(name=f"CP{_checkpoint_order}", order=_checkpoint_order)
        db.add(checkpoint)
        await db.flush()
        checkpoint_id = checkpoint.id

    activity = Activity(
        name="Act",
        activity_type=activity_type,
        config=config or {"min_points": 0, "max_points": 100},
        checkpoint_id=checkpoint_id,
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
    result_data: dict,
    final_score: float,
    time_score: float | None = None,
) -> ActivityResult:
    result = ActivityResult(
        activity_id=activity.id,
        team_id=team.id,
        result_data=result_data,
        final_score=final_score,
        time_score=time_score,
        is_completed=True,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)
    return result


# --------------------------------------------------------------------------- #
# team totals
# --------------------------------------------------------------------------- #
async def test_calculate_team_total_sums_completed_results(pg_session):
    team = await _make_team(pg_session)
    activity_a = await _make_activity(pg_session)
    activity_b = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity_a,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    await _make_result(
        pg_session,
        team=team,
        activity=activity_b,
        result_data={"assigned_points": 30},
        final_score=30,
    )

    await ScoringService(pg_session).update_team_scores(team.id)

    await pg_session.refresh(team)
    assert team.total == 70


async def test_calculate_team_total_ignores_incomplete(pg_session):
    team = await _make_team(pg_session)
    activity_done = await _make_activity(pg_session)
    activity_pending = await _make_activity(pg_session)
    completed = await _make_result(
        pg_session,
        team=team,
        activity=activity_done,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    pending = ActivityResult(
        activity_id=activity_pending.id,
        team_id=team.id,
        result_data={"assigned_points": 99},
        final_score=99,
        is_completed=False,
    )
    pg_session.add(pending)
    await pg_session.commit()

    await ScoringService(pg_session).update_team_scores(team.id)

    await pg_session.refresh(team)
    assert team.total == 40
    assert completed.final_score == pytest.approx(40)


async def test_total_counts_global_activity_without_checkpoint(pg_session):
    """A global activity (checkpoint_id NULL) still scores points."""
    team = await _make_team(pg_session)
    at_checkpoint = await _make_activity(pg_session)
    global_activity = await _make_activity(pg_session, with_checkpoint=False)
    await _make_result(
        pg_session,
        team=team,
        activity=at_checkpoint,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    await _make_result(
        pg_session,
        team=team,
        activity=global_activity,
        result_data={"assigned_points": 25},
        final_score=25,
    )

    await ScoringService(pg_session).update_team_scores(team.id)

    await pg_session.refresh(team)
    assert team.total == 65
    _, _, raw_total = await ScoringService(pg_session)._checkpoint_scores_for_team(team.id)
    assert raw_total == pytest.approx(65)


async def test_bulk_total_counts_global_activity_without_checkpoint(pg_session):
    """update_all_team_scores must apply the same rule as update_team_scores."""
    team = await _make_team(pg_session, name="Bulk Global")
    global_activity = await _make_activity(pg_session, with_checkpoint=False)
    await _make_result(
        pg_session,
        team=team,
        activity=global_activity,
        result_data={"assigned_points": 25},
        final_score=25,
    )

    await ScoringService(pg_session).update_all_team_scores([team])

    assert team.total == 25


async def test_update_team_scores_rounds_and_includes_awards(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 50},
        final_score=50.4,
    )
    pg_session.add(DynamicAward(team_id=team.id, points=10, is_active=True))
    pg_session.add(DynamicAward(team_id=team.id, points=99, is_active=False))
    await pg_session.commit()

    svc = ScoringService(pg_session)
    changed = await svc.update_team_scores(team.id)

    await pg_session.refresh(team)
    assert changed is True
    assert team.total == pytest.approx(60)


async def test_update_team_scores_missing_team_returns_false(pg_session):
    svc = ScoringService(pg_session)
    assert await svc.update_team_scores(999999) is False


async def test_scoring_a_result_reranks_without_a_checkpoint_advance(pg_session):
    activity = await _make_activity(pg_session)
    leader = await _make_team(pg_session, "Underdog")
    other = await _make_team(pg_session, "Front runner")
    await _make_result(
        pg_session,
        team=leader,
        activity=activity,
        result_data={"assigned_points": 100},
        final_score=100,
    )
    await pg_session.commit()

    svc = ScoringService(pg_session)
    await svc.update_team_scores(leader.id)

    await pg_session.refresh(leader)
    await pg_session.refresh(other)
    assert leader.total == 100
    assert leader.classification == 1
    assert other.classification == 2


async def test_award_alone_reranks_the_team(pg_session):
    trailing = await _make_team(pg_session, "Zeroes")
    awarded = await _make_team(pg_session, "Bonus")
    pg_session.add(DynamicAward(team_id=awarded.id, points=25, is_active=True))
    await pg_session.commit()

    await ScoringService(pg_session).update_team_scores(awarded.id)

    await pg_session.refresh(awarded)
    await pg_session.refresh(trailing)
    assert awarded.total == 25
    assert awarded.classification == 1
    assert trailing.classification == 2


async def test_ranking_tie_breaks_on_earliest_last_scored_at(pg_session):
    activity = await _make_activity(pg_session)
    early = await _make_team(pg_session, "Early")
    late = await _make_team(pg_session, "Late")
    for team in (early, late):
        await _make_result(
            pg_session,
            team=team,
            activity=activity,
            result_data={"assigned_points": 40},
            final_score=40,
        )
    await pg_session.commit()

    svc = ScoringService(pg_session)
    await svc.update_team_scores(early.id)
    await pg_session.refresh(early)
    early.last_scored_at = datetime(2020, 1, 1, tzinfo=UTC)
    await pg_session.commit()
    await svc.update_team_scores(late.id)

    await pg_session.refresh(early)
    await pg_session.refresh(late)
    assert early.total == late.total == 40
    assert early.classification == 1
    assert late.classification == 2


async def test_get_settings_creates_default_row_when_none_exists(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings

    existing = (await pg_session.scalars(sa_select(RallySettings))).first()
    assert existing is None

    svc = ScoringService(pg_session)
    settings = await svc._get_settings()

    assert settings is not None
    assert settings.id is not None
    settings_again = await svc._get_settings()
    assert settings_again is settings


async def test_update_all_team_scores_noop_on_empty_list(pg_session):
    svc = ScoringService(pg_session)
    await svc.update_all_team_scores([])


async def test_checkpoint_scores_skips_incomplete_and_global_results(pg_session):
    team = await _make_team(pg_session)
    cp = CheckPoint(name="CP", order=1)
    pg_session.add(cp)
    await pg_session.flush()
    checkpointed_activity = await _make_activity_on_checkpoint(pg_session, cp)
    another_checkpointed_activity = await _make_activity_on_checkpoint(pg_session, cp)
    global_activity = Activity(
        name="Global",
        activity_type=ActivityType.GENERAL.value,
        config={"min_points": 0, "max_points": 100},
        checkpoint_id=None,
    )
    pg_session.add(global_activity)
    await pg_session.commit()
    await pg_session.refresh(global_activity)

    await _make_result(
        pg_session,
        team=team,
        activity=checkpointed_activity,
        result_data={"assigned_points": 25},
        final_score=25,
    )
    incomplete = ActivityResult(
        team_id=team.id,
        activity_id=another_checkpointed_activity.id,
        result_data={},
        final_score=99,
        is_completed=False,
    )
    pg_session.add(incomplete)
    await _make_result(
        pg_session,
        team=team,
        activity=global_activity,
        result_data={"assigned_points": 99},
        final_score=99,
    )
    await pg_session.commit()

    svc = ScoringService(pg_session)
    checkpoint_scores, order_by_id, total = await svc._checkpoint_scores_for_team(team.id)

    assert total == pytest.approx(25 + 99)
    assert list(checkpoint_scores.values()) == [25]


async def test_update_team_scores_wraps_commit_failure_in_rally_error(pg_session, monkeypatch):
    team = await _make_team(pg_session)

    async def _boom():
        raise RuntimeError("connection lost")

    monkeypatch.setattr(pg_session, "commit", _boom)

    svc = ScoringService(pg_session)
    with pytest.raises(RallyError, match="Failed to update team scores"):
        await svc.update_team_scores(team.id)


async def test_update_all_team_scores_bulk_recomputes_multiple_teams(pg_session):
    cp = CheckPoint(name="CP", order=1)
    pg_session.add(cp)
    await pg_session.flush()
    activity = await _make_activity_on_checkpoint(pg_session, cp)

    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")
    team_c = await _make_team(pg_session, "C")

    another_activity = await _make_activity_on_checkpoint(pg_session, cp)
    global_activity = Activity(
        name="Global",
        activity_type=ActivityType.GENERAL.value,
        config={"min_points": 0, "max_points": 100},
        checkpoint_id=None,
    )
    pg_session.add(global_activity)
    await pg_session.commit()
    await pg_session.refresh(global_activity)

    await _make_result(
        pg_session,
        team=team_a,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    await _make_result(
        pg_session,
        team=team_b,
        activity=activity,
        result_data={"assigned_points": 20},
        final_score=20,
    )
    pg_session.add(
        ActivityResult(
            team_id=team_a.id,
            activity_id=another_activity.id,
            result_data={},
            final_score=99,
            is_completed=False,
        )
    )
    await _make_result(
        pg_session,
        team=team_a,
        activity=global_activity,
        result_data={"assigned_points": 99},
        final_score=99,
    )
    await _make_result(
        pg_session,
        team=team_c,
        activity=activity,
        result_data={"assigned_points": 15},
        final_score=15,
    )
    pg_session.add(DynamicAward(team_id=team_a.id, points=10, is_active=True, reason="bonus"))
    await pg_session.commit()

    svc = ScoringService(pg_session)
    await svc.update_all_team_scores([team_a, team_b])

    assert team_a.total == pytest.approx(149)
    assert team_b.total == pytest.approx(20)


async def _make_activity_on_checkpoint(db, checkpoint: CheckPoint) -> Activity:
    activity = Activity(
        name="Act",
        activity_type=ActivityType.GENERAL.value,
        config={"min_points": 0, "max_points": 100},
        checkpoint_id=checkpoint.id,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def test_score_per_checkpoint_keyed_by_id_not_order(pg_session):
    from datetime import datetime

    team = await _make_team(pg_session)
    cp_a = CheckPoint(name="A", order=1)
    cp_b = CheckPoint(name="B", order=1)
    pg_session.add_all([cp_a, cp_b])
    await pg_session.flush()
    act_a = await _make_activity_on_checkpoint(pg_session, cp_a)
    act_b = await _make_activity_on_checkpoint(pg_session, cp_b)

    await _make_result(
        pg_session,
        team=team,
        activity=act_a,
        result_data={"assigned_points": 30},
        final_score=30,
    )
    await _make_result(
        pg_session,
        team=team,
        activity=act_b,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    team.times = [datetime(2026, 1, 1, 10, 0), datetime(2026, 1, 1, 11, 0)]
    await pg_session.commit()

    await ScoringService(pg_session).update_team_scores(team.id)
    await pg_session.refresh(team)

    assert sorted(team.score_per_checkpoint) == [30, 40]
    assert team.total == pytest.approx(70)


async def test_score_per_checkpoint_ordered_by_current_order(pg_session):
    from datetime import datetime

    team = await _make_team(pg_session)
    cp1 = CheckPoint(name="C1", order=1)
    cp2 = CheckPoint(name="C2", order=2)
    pg_session.add_all([cp1, cp2])
    await pg_session.flush()
    act1 = await _make_activity_on_checkpoint(pg_session, cp1)
    act2 = await _make_activity_on_checkpoint(pg_session, cp2)

    await _make_result(
        pg_session,
        team=team,
        activity=act1,
        result_data={"assigned_points": 15},
        final_score=15,
    )
    await _make_result(
        pg_session,
        team=team,
        activity=act2,
        result_data={"assigned_points": 25},
        final_score=25,
    )
    team.times = [datetime(2026, 1, 1, 10, 0), datetime(2026, 1, 1, 11, 0)]
    await pg_session.commit()

    await ScoringService(pg_session).update_team_scores(team.id)
    await pg_session.refresh(team)

    assert team.score_per_checkpoint == [15, 25]
    assert team.score_per_checkpoint[-1] == 25


# --------------------------------------------------------------------------- #
# extra shots
# --------------------------------------------------------------------------- #
async def test_apply_extra_shots_bonus_increases_score(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 50},
        final_score=50,
    )

    svc = ScoringService(pg_session)
    ok = await svc.apply_extra_shots_bonus(team.id, activity.id, extra_shots=2)

    assert ok is True
    stmt_result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert stmt_result.extra_shots == 2
    assert stmt_result.final_score == pytest.approx(52)


async def test_apply_extra_shots_over_limit_rejected(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 50},
        final_score=50,
    )

    svc = ScoringService(pg_session)
    ok = await svc.apply_extra_shots_bonus(team.id, activity.id, extra_shots=20)

    assert ok is False


async def test_apply_extra_shots_missing_team(pg_session):
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)
    assert await svc.apply_extra_shots_bonus(999999, activity.id, 1) is False


async def test_apply_extra_shots_missing_result(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)
    assert await svc.apply_extra_shots_bonus(team.id, activity.id, 1) is False


# --------------------------------------------------------------------------- #
# penalties
# --------------------------------------------------------------------------- #
async def test_apply_penalty_reduces_score(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings

    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 50},
        final_score=50,
    )

    svc = ScoringService(pg_session)
    await svc._get_settings()
    settings = (await pg_session.scalars(sa_select(RallySettings))).first()
    settings.penalty_per_puke = 10
    await pg_session.commit()

    ok = await svc.apply_penalty(team.id, activity.id, "vomit", 1)

    assert ok is True
    result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert result.penalties["vomit"] == 10
    assert result.penalty_counts["vomit"] == 1
    assert result.final_score == pytest.approx(40)


async def test_apply_penalty_unknown_type_rejected(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 50},
        final_score=50,
    )

    svc = ScoringService(pg_session)
    with pytest.raises(RallyValidationError, match="Unknown penalty type"):
        await svc.apply_penalty(team.id, activity.id, "custom", 10)


async def test_apply_penalty_missing_result(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)
    assert await svc.apply_penalty(team.id, activity.id, "vomit", 5) is False


# --------------------------------------------------------------------------- #
# result orchestration
# --------------------------------------------------------------------------- #
async def test_create_result_scores_and_persists(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)

    svc = ScoringService(pg_session)
    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 70},
            is_completed=True,
        )
    )

    assert created.id is not None
    assert created.final_score == pytest.approx(70)
    await pg_session.refresh(team)
    assert team.total == pytest.approx(70)


async def test_create_result_unknown_activity_raises(pg_session):
    team = await _make_team(pg_session)
    svc = ScoringService(pg_session)
    obj_in = ActivityResultCreate(
        activity_id=999999,
        team_id=team.id,
        result_data={"assigned_points": 10},
        is_completed=True,
    )
    with pytest.raises(ValueError):
        await svc.create_result(obj_in)


async def test_create_result_invalid_data_raises(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)
    obj_in = ActivityResultCreate(
        activity_id=activity.id,
        team_id=team.id,
        result_data={"wrong": 1},
        is_completed=True,
    )
    with pytest.raises(ValueError):
        await svc.create_result(obj_in)


async def test_update_result_rescores_on_data_change(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )

    svc = ScoringService(pg_session)
    updated = await svc.update_result(
        result, ActivityResultUpdate(result_data={"assigned_points": 90})
    )

    assert updated.final_score == pytest.approx(90)
    await pg_session.refresh(team)
    assert team.total == pytest.approx(90)


async def test_update_result_records_history_with_editor(pg_session):
    from sqlalchemy import select
    from app.models.evaluation_history import EvaluationAction, EvaluationHistory
    from app.services.scoring_service import EvaluationEditor

    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )

    svc = ScoringService(pg_session)
    await svc.update_result(
        result,
        ActivityResultUpdate(result_data={"assigned_points": 90}),
        editor=EvaluationEditor(id="user-1", name="Alice"),
    )

    rows = (
        await pg_session.scalars(
            select(EvaluationHistory).where(EvaluationHistory.result_id == result.id)
        )
    ).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.action == EvaluationAction.UPDATED.value
    assert row.editor_id == "user-1"
    assert row.editor_name == "Alice"
    assert row.changes["final_score"] == {"before": 40.0, "after": 90.0}
    assert row.changes["result_data"]["before"] == {"assigned_points": 40}
    assert row.changes["result_data"]["after"] == {"assigned_points": 90}


async def test_update_result_no_change_writes_no_history(pg_session):
    from sqlalchemy import select
    from app.models.evaluation_history import EvaluationHistory
    from app.services.scoring_service import EvaluationEditor

    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    result.points_score = 40
    await pg_session.commit()

    svc = ScoringService(pg_session)
    await svc.update_result(
        result,
        ActivityResultUpdate(result_data={"assigned_points": 40}),
        editor=EvaluationEditor(id="user-1", name="Alice"),
    )

    rows = (
        await pg_session.scalars(
            select(EvaluationHistory).where(EvaluationHistory.result_id == result.id)
        )
    ).all()
    assert rows == []


async def test_update_result_without_editor_skips_history(pg_session):
    from sqlalchemy import select
    from app.models.evaluation_history import EvaluationHistory

    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )

    svc = ScoringService(pg_session)
    await svc.update_result(result, ActivityResultUpdate(result_data={"assigned_points": 90}))

    rows = (
        await pg_session.scalars(
            select(EvaluationHistory).where(EvaluationHistory.result_id == result.id)
        )
    ).all()
    assert rows == []


async def test_remove_result_deletes_and_updates_team(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    result = await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 40},
        final_score=40,
    )
    await ScoringService(pg_session).update_team_scores(team.id)

    svc = ScoringService(pg_session)
    removed = await svc.remove_result(result.id)

    assert removed is not None
    await pg_session.refresh(team)
    assert team.total == pytest.approx(0)
    assert (await pg_session.get(ActivityResult, result.id)) is None


async def test_remove_result_missing_returns_none(pg_session):
    svc = ScoringService(pg_session)
    assert await svc.remove_result(999999) is None


# --------------------------------------------------------------------------- #
# rankings & statistics
# --------------------------------------------------------------------------- #
async def test_get_team_ranking_orders_by_score(pg_session):
    activity = await _make_activity(pg_session)
    strong = await _make_team(pg_session, "Strong")
    weak = await _make_team(pg_session, "Weak")
    await _make_result(
        pg_session,
        team=strong,
        activity=activity,
        result_data={"assigned_points": 90},
        final_score=90,
    )
    await _make_result(
        pg_session,
        team=weak,
        activity=activity,
        result_data={"assigned_points": 20},
        final_score=20,
    )

    svc = ScoringService(pg_session)
    ranking = await svc.get_team_ranking(activity_id=activity.id)

    assert len(ranking) == 2
    assert ranking[0]["team_id"] == strong.id
    assert ranking[1]["team_id"] == weak.id


async def test_get_activity_statistics_reports_participation(pg_session):
    activity = await _make_activity(pg_session)
    team = await _make_team(pg_session)
    await _make_result(
        pg_session,
        team=team,
        activity=activity,
        result_data={"assigned_points": 60},
        final_score=60,
    )

    svc = ScoringService(pg_session)
    stats = await svc.get_activity_statistics(activity.id)

    assert stats["total_participants"] == 1
    assert stats["average_score"] == pytest.approx(60)


async def test_get_global_ranking_orders_and_ranks(pg_session):
    activity = await _make_activity(pg_session)
    strong = await _make_team(pg_session, "Strong")
    weak = await _make_team(pg_session, "Weak")
    await _make_result(
        pg_session,
        team=strong,
        activity=activity,
        result_data={"assigned_points": 80},
        final_score=80,
    )
    await _make_result(
        pg_session,
        team=weak,
        activity=activity,
        result_data={"assigned_points": 20},
        final_score=20,
    )

    svc = ScoringService(pg_session)
    await svc.update_team_scores(strong.id)
    await svc.update_team_scores(weak.id)

    ranking = await svc.get_team_ranking()

    top = next(r for r in ranking if r["team_id"] == strong.id)
    bottom = next(r for r in ranking if r["team_id"] == weak.id)
    assert top["rank"] == 1
    assert top["total_score"] == pytest.approx(80)
    assert bottom["rank"] > top["rank"]


async def test_get_global_ranking_counts_active_dynamic_awards(pg_session):
    activity = await _make_activity(pg_session)
    charged = await _make_team(pg_session, "Bought hints")
    clean = await _make_team(pg_session, "Solved it")
    for team in (charged, clean):
        await _make_result(
            pg_session,
            team=team,
            activity=activity,
            result_data={"assigned_points": 100},
            final_score=100,
        )
    pg_session.add(DynamicAward(team_id=charged.id, points=-10, is_active=True))
    pg_session.add(DynamicAward(team_id=charged.id, points=-10, is_active=True))
    pg_session.add(DynamicAward(team_id=charged.id, points=-50, is_active=False))
    await pg_session.flush()

    svc = ScoringService(pg_session)
    await svc.update_team_scores(charged.id)
    await svc.update_team_scores(clean.id)
    ranking = await svc.get_team_ranking()

    charged_row = next(r for r in ranking if r["team_id"] == charged.id)
    clean_row = next(r for r in ranking if r["team_id"] == clean.id)
    assert charged_row["total_score"] == pytest.approx(80)
    assert clean_row["total_score"] == pytest.approx(100)
    assert clean_row["rank"] < charged_row["rank"]
    assert charged_row["activities_completed"] == 1


async def test_get_global_ranking_scores_a_team_with_only_awards(pg_session):
    penalised = await _make_team(pg_session, "Gave up immediately")
    pg_session.add(DynamicAward(team_id=penalised.id, points=-30, is_active=True))
    await pg_session.flush()

    svc = ScoringService(pg_session)
    await svc.update_team_scores(penalised.id)
    ranking = await svc.get_team_ranking()

    row = next(r for r in ranking if r["team_id"] == penalised.id)
    assert row["total_score"] == pytest.approx(-30)
    assert row["activities_completed"] == 0


async def test_get_activity_statistics_empty(pg_session):
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)
    stats = await svc.get_activity_statistics(activity.id)
    assert stats["total_participants"] == 0
    assert stats["average_score"] == pytest.approx(0)


# --------------------------------------------------------------------------- #
# time-based ranking
# --------------------------------------------------------------------------- #
async def test_create_time_based_result_reranks_activity(pg_session):
    activity = await _make_activity(
        pg_session,
        activity_type=ActivityType.TIME_BASED.value,
        config={"max_points": 100, "min_points": 10},
    )
    fast = await _make_team(pg_session, "Fast")
    slow = await _make_team(pg_session, "Slow")

    svc = ScoringService(pg_session)
    await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=slow.id,
            result_data={"completion_time_seconds": 90},
            is_completed=True,
        )
    )
    await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=fast.id,
            result_data={"completion_time_seconds": 30},
            is_completed=True,
        )
    )

    fast_res = (await pg_session.scalars(_select_result(activity.id, fast.id))).first()
    slow_res = (await pg_session.scalars(_select_result(activity.id, slow.id))).first()
    assert fast_res.final_score >= slow_res.final_score
    assert fast_res.final_score == pytest.approx(100)


async def test_concurrent_time_based_evaluations_rank_against_each_other(pg_session, _pg_engine):
    activity = await _make_activity(
        pg_session,
        activity_type=ActivityType.TIME_BASED.value,
        config={"max_points": 100, "min_points": 10},
    )
    fast = await _make_team(pg_session, "Fast")
    slow = await _make_team(pg_session, "Slow")
    await pg_session.commit()

    maker = async_sessionmaker(_pg_engine, expire_on_commit=False)
    stall = 0.3

    async def evaluate(team_id: int, seconds: float) -> None:
        async with maker() as session:
            service = ScoringService(session)
            original_commit = service._commit_and_publish_team_scores

            async def stalled_commit(totals: dict[int, float]) -> None:
                await asyncio.sleep(stall)
                await original_commit(totals)

            service._commit_and_publish_team_scores = stalled_commit  # type: ignore[method-assign]
            await service.create_result(
                ActivityResultCreate(
                    activity_id=activity.id,
                    team_id=team_id,
                    result_data={"completion_time_seconds": seconds},
                    is_completed=True,
                )
            )

    await asyncio.gather(
        evaluate(slow.id, 90),
        evaluate(fast.id, 30),
    )

    fast_res = (await pg_session.scalars(_select_result(activity.id, fast.id))).first()
    slow_res = (await pg_session.scalars(_select_result(activity.id, slow.id))).first()
    assert fast_res.final_score == pytest.approx(100)
    assert slow_res.final_score == pytest.approx(10)


async def test_removing_time_based_result_reranks_the_rest(pg_session):
    activity = await _make_activity(
        pg_session,
        activity_type=ActivityType.TIME_BASED.value,
        config={"max_points": 100, "min_points": 10},
    )
    fast = await _make_team(pg_session, "Fast Del")
    mid = await _make_team(pg_session, "Mid Del")
    slow = await _make_team(pg_session, "Slow Del")

    svc = ScoringService(pg_session)
    for team, seconds in ((fast, 30), (mid, 60), (slow, 90)):
        await svc.create_result(
            ActivityResultCreate(
                activity_id=activity.id,
                team_id=team.id,
                result_data={"completion_time_seconds": seconds},
                is_completed=True,
            )
        )

    mid_res = (await pg_session.scalars(_select_result(activity.id, mid.id))).first()
    assert mid_res.final_score == pytest.approx(55)

    fast_res = (await pg_session.scalars(_select_result(activity.id, fast.id))).first()
    await svc.remove_result(fast_res.id)

    mid_res = (await pg_session.scalars(_select_result(activity.id, mid.id))).first()
    assert mid_res.final_score == pytest.approx(100)
    await pg_session.refresh(mid)
    assert mid.total == 100


async def test_reprice_all_results_applies_changed_settings(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings

    team = await _make_team(pg_session, "Reprice")
    activity = await _make_activity(pg_session)

    svc = ScoringService(pg_session)
    await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            extra_shots=2,
            is_completed=True,
        )
    )
    result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert result.final_score == pytest.approx(52)

    settings = (await pg_session.scalars(sa_select(RallySettings))).first()
    settings.bonus_per_extra_shot = 10
    await pg_session.commit()

    repriced = await ScoringService(pg_session).reprice_all_results()
    await pg_session.commit()

    assert repriced == 1
    await pg_session.refresh(result)
    assert result.final_score == pytest.approx(70)


async def test_penalty_counts_are_priced_by_the_server(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings

    team = await _make_team(pg_session, "Counts")
    activity = await _make_activity(
        pg_session,
        config={
            "min_points": 0,
            "max_points": 100,
            "penalty_counters": [{"key": "miss", "label": "Falha", "points": 7}],
        },
    )

    svc = ScoringService(pg_session)
    await svc._get_settings()
    settings = (await pg_session.scalars(sa_select(RallySettings))).first()
    settings.penalty_per_puke = -10
    await pg_session.commit()

    await ScoringService(pg_session).create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            penalty_counts={"vomit": 2, "miss": 3},
            is_completed=True,
        )
    )

    result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert result.penalties == {"vomit": 20, "miss": 21}
    assert result.penalty_counts == {"vomit": 2, "miss": 3}
    assert result.final_score == pytest.approx(50 - 41)


async def test_penalty_counts_reject_unknown_key(pg_session):
    team = await _make_team(pg_session, "Unknown Counts")
    activity = await _make_activity(pg_session)

    with pytest.raises(RallyValidationError, match="Unknown penalty type"):
        await ScoringService(pg_session).create_result(
            ActivityResultCreate(
                activity_id=activity.id,
                team_id=team.id,
                result_data={"assigned_points": 50},
                penalty_counts={"made_up_penalty": 9999},
                is_completed=True,
            )
        )


async def test_deleted_global_rule_does_not_break_edit_or_reprice(pg_session):
    from app.crud.crud_activity import rally_event
    from app.models.dynamic_scoring import PENALTY_COUNTER_RULE_TYPE, DynamicRule

    event = await rally_event.get_current(pg_session)
    rule = DynamicRule(
        event_id=event.id if event else None,
        rule_type=PENALTY_COUNTER_RULE_TYPE,
        name="Atraso",
        points=15.0,
        is_active=True,
    )
    pg_session.add(rule)
    await pg_session.commit()
    await pg_session.refresh(rule)

    team = await _make_team(pg_session, "Orphan Rule")
    activity = await _make_activity(pg_session)

    await ScoringService(pg_session).create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            penalty_counts={f"g_{rule.id}": 2},
            is_completed=True,
        )
    )
    result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert result.penalties == {f"g_{rule.id}": 30}

    rule.is_active = False
    await pg_session.commit()

    await ScoringService(pg_session).update_result(
        result,
        ActivityResultUpdate(
            result_data={"assigned_points": 60}, penalty_counts={f"g_{rule.id}": 2}
        ),
    )
    await pg_session.refresh(result)
    assert result.penalties == {f"g_{rule.id}": 30}
    assert result.final_score == pytest.approx(60 - 30)

    repriced = await ScoringService(pg_session).reprice_all_results()
    assert repriced == 1
    await pg_session.refresh(result)
    assert result.penalties == {f"g_{rule.id}": 30}


async def test_peddy_paper_event_rejects_drinking_penalty_keys(pg_session):
    from app.tests.conftest import make_event

    await make_event(pg_session, event_type="peddy_paper")
    team = await _make_team(pg_session, "Peddy Paper Team")
    activity = await _make_activity(pg_session)

    with pytest.raises(RallyValidationError, match="Unknown penalty type"):
        await ScoringService(pg_session).create_result(
            ActivityResultCreate(
                activity_id=activity.id,
                team_id=team.id,
                result_data={"assigned_points": 50},
                penalty_counts={"vomit": 1},
                is_completed=True,
            )
        )


async def test_peddy_paper_event_ignores_extra_shots_bonus(pg_session):
    from app.tests.conftest import make_event

    await make_event(pg_session, event_type="peddy_paper")
    team = await _make_team(pg_session, "Peddy Paper Shots")
    activity = await _make_activity(pg_session)

    result = await ScoringService(pg_session).create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            extra_shots=5,
            is_completed=True,
        )
    )
    assert result.final_score == pytest.approx(50)


async def test_rally_tascas_event_still_prices_drinking_penalties(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings
    from app.tests.conftest import make_event

    await make_event(pg_session, event_type="rally_tascas")
    team = await _make_team(pg_session, "Rally Tascas Team")
    activity = await _make_activity(pg_session)

    svc = ScoringService(pg_session)
    await svc._get_settings()
    settings = (await pg_session.scalars(sa_select(RallySettings))).first()
    settings.penalty_per_puke = 10
    await pg_session.commit()

    result = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            penalty_counts={"vomit": 1},
            is_completed=True,
        )
    )
    assert result.final_score == pytest.approx(40)


async def test_resolve_penalty_points_non_strict_prices_orphan_key_at_zero(pg_session):
    activity = await _make_activity(
        pg_session,
        config={
            "min_points": 0,
            "max_points": 100,
            "penalty_counters": [{"key": "miss", "label": "Falha", "points": 7}],
        },
    )
    svc = ScoringService(pg_session)

    priced = await svc.resolve_penalty_points(activity, {"miss": 2, "old_key": 3}, strict=False)
    assert priced == {"miss": 14, "old_key": 0}

    with pytest.raises(RallyValidationError, match="Unknown penalty type"):
        await svc.resolve_penalty_points(activity, {"old_key": 3})


async def test_editing_counts_reprices_without_corrupting_the_count(pg_session):
    from sqlalchemy import select as sa_select
    from app.models.rally_settings import RallySettings

    team = await _make_team(pg_session, "Edit Counts")
    activity = await _make_activity(pg_session)

    svc = ScoringService(pg_session)
    await svc._get_settings()
    settings = (await pg_session.scalars(sa_select(RallySettings))).first()
    settings.penalty_per_puke = -10
    await pg_session.commit()

    await ScoringService(pg_session).create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 50},
            penalty_counts={"vomit": 2},
            is_completed=True,
        )
    )
    result = (await pg_session.scalars(_select_result(activity.id, team.id))).first()
    assert result.penalties == {"vomit": 20}

    settings.penalty_per_puke = -5
    await pg_session.commit()

    await ScoringService(pg_session).update_result(
        result, ActivityResultUpdate(penalty_counts={"vomit": 2})
    )

    await pg_session.refresh(result)
    assert result.penalty_counts == {"vomit": 2}
    assert result.penalties == {"vomit": 10}
    assert result.final_score == pytest.approx(40)


async def test_recalculate_result_score_noop_when_activity_missing(pg_session):
    svc = ScoringService(pg_session)
    orphan_result = ActivityResult(
        activity_id=999999,
        team_id=1,
        result_data={},
        final_score=None,
    )

    await svc._recalculate_result_score(orphan_result)

    assert orphan_result.final_score is None


async def test_update_time_based_result_reranks_activity(pg_session):
    activity = await _make_activity(
        pg_session,
        activity_type=ActivityType.TIME_BASED.value,
        config={"max_points": 100, "min_points": 10},
    )
    fast = await _make_team(pg_session, "Fast")
    slow = await _make_team(pg_session, "Slow")

    svc = ScoringService(pg_session)
    await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=slow.id,
            result_data={"completion_time_seconds": 90},
            is_completed=True,
        )
    )
    fast_created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=fast.id,
            result_data={"completion_time_seconds": 60},
            is_completed=True,
        )
    )

    await svc.update_result(
        fast_created, ActivityResultUpdate(result_data={"completion_time_seconds": 10})
    )

    slow_res = (await pg_session.scalars(_select_result(activity.id, slow.id))).first()
    fast_res = (await pg_session.scalars(_select_result(activity.id, fast.id))).first()
    assert fast_res.final_score == pytest.approx(100)
    assert slow_res.final_score is not None


# --------------------------------------------------------------------------- #
# team vs team
# --------------------------------------------------------------------------- #
async def _make_team_vs_activity(db):
    return await _make_activity(
        db,
        activity_type=ActivityType.TEAM_VS.value,
        config={"win_points": 100, "draw_points": 50, "lose_points": 0},
    )


async def _pair_team_vs(db, team1: Team, team2: Team) -> None:
    team1.versus_group_id = team1.id
    team2.versus_group_id = team1.id
    await db.commit()


async def test_validate_team_vs_match_ok(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "T1")
    t2 = await _make_team(pg_session, "T2")
    await _pair_team_vs(pg_session, t1, t2)

    svc = ScoringService(pg_session)
    assert await svc.validate_team_vs_match(t1.id, t2.id, activity.id) is True


async def test_validate_team_vs_match_rejects_unconfigured_pair(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "Unpaired T1")
    t2 = await _make_team(pg_session, "Unpaired T2")

    assert (
        await ScoringService(pg_session).validate_team_vs_match(
            t1.id, t2.id, activity.id, winner_id=t1.id
        )
        is False
    )


async def test_validate_team_vs_match_missing_team(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "T1")
    svc = ScoringService(pg_session)
    assert await svc.validate_team_vs_match(t1.id, 999999, activity.id) is False


async def test_create_team_vs_result_win_lose(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    winner = await _make_team(pg_session, "Winner")
    loser = await _make_team(pg_session, "Loser")
    await _pair_team_vs(pg_session, winner, loser)

    svc = ScoringService(pg_session)
    r1, r2 = await svc.create_team_vs_result(
        winner.id,
        loser.id,
        activity.id,
        winner_id=winner.id,
        match_data={},
    )

    by_team = {r.team_id: r for r in (r1, r2)}
    assert by_team[winner.id].result_data["result"] == "win"
    assert by_team[loser.id].result_data["result"] == "lose"
    assert by_team[winner.id].final_score == pytest.approx(100)
    assert by_team[loser.id].final_score == pytest.approx(0)

    await pg_session.refresh(winner)
    assert winner.total == pytest.approx(100)


async def test_create_team_vs_result_draw(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "T1")
    t2 = await _make_team(pg_session, "T2")
    await _pair_team_vs(pg_session, t1, t2)

    svc = ScoringService(pg_session)
    r1, r2 = await svc.create_team_vs_result(
        t1.id,
        t2.id,
        activity.id,
        winner_id=0,
        match_data={},
    )

    assert r1.result_data["result"] == "draw"
    assert r2.result_data["result"] == "draw"
    assert r1.final_score == pytest.approx(50)
    assert r2.final_score == pytest.approx(50)


async def test_create_team_vs_result_rejects_completed_rematch(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "T1")
    t2 = await _make_team(pg_session, "T2")
    await _pair_team_vs(pg_session, t1, t2)

    svc = ScoringService(pg_session)
    await svc.create_team_vs_result(t1.id, t2.id, activity.id, winner_id=t1.id, match_data={})

    with pytest.raises(RallyValidationError):
        await svc.create_team_vs_result(t1.id, t2.id, activity.id, winner_id=t2.id, match_data={})


async def test_validate_team_vs_match_rejects_when_only_team2_completed(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "T1")
    t2 = await _make_team(pg_session, "T2")
    await _pair_team_vs(pg_session, t1, t2)
    await _make_result(
        pg_session,
        team=t2,
        activity=activity,
        result_data={"result": "win"},
        final_score=100,
    )

    svc = ScoringService(pg_session)
    assert await svc.validate_team_vs_match(t1.id, t2.id, activity.id) is False


async def test_create_team_vs_result_rejects_missing_activity(pg_session):
    t1 = await _make_team(pg_session, "T1")
    t2 = await _make_team(pg_session, "T2")
    await _pair_team_vs(pg_session, t1, t2)
    svc = ScoringService(pg_session)

    with pytest.raises(RallyValidationError):
        await svc.create_team_vs_result(
            t1.id, t2.id, 999999, winner_id=t1.id, match_data={}
        )


async def test_create_team_vs_result_rejects_invalid_winner(pg_session):
    activity = await _make_team_vs_activity(pg_session)
    t1 = await _make_team(pg_session, "Winner T1")
    t2 = await _make_team(pg_session, "Winner T2")
    outsider = await _make_team(pg_session, "Winner outsider")
    await _pair_team_vs(pg_session, t1, t2)

    with pytest.raises(RallyValidationError):
        await ScoringService(pg_session).create_team_vs_result(
            t1.id,
            t2.id,
            activity.id,
            winner_id=outsider.id,
            match_data={},
        )


# --------------------------------------------------------------------------- #
# G1: penalty excess
# --------------------------------------------------------------------------- #
async def _excess_award(db, result_id: int) -> DynamicAward | None:
    from sqlalchemy import select

    return (
        await db.scalars(select(DynamicAward).where(DynamicAward.activity_result_id == result_id))
    ).first()


async def test_penalty_excess_becomes_negative_award(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)

    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 40},
            penalties={"custom": 100},
            is_completed=True,
        )
    )

    assert created.final_score == pytest.approx(0)
    award = await _excess_award(pg_session, created.id)
    assert award is not None
    assert award.points == -60
    assert award.activity_result_id == created.id
    await pg_session.refresh(team)
    assert team.total == pytest.approx(-60)


async def test_excess_award_persists_on_deferred_recompute_path(pg_session, monkeypatch):
    from unittest.mock import AsyncMock

    monkeypatch.setattr(ScoringService, "_defer_recompute", property(lambda _: True))

    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)

    commit_spy = AsyncMock(wraps=pg_session.commit)
    monkeypatch.setattr(pg_session, "commit", commit_spy)

    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 40},
            penalties={"custom": 100},
            is_completed=True,
        )
    )

    assert commit_spy.await_count >= 1

    award = await _excess_award(pg_session, created.id)
    assert award is not None
    assert award.points == -60


async def test_reducing_penalty_below_points_clears_excess_award(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)

    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 40},
            penalties={"custom": 100},
            is_completed=True,
        )
    )
    assert await _excess_award(pg_session, created.id) is not None

    await svc.update_result(created, ActivityResultUpdate(penalties={"custom": 10}))

    assert await _excess_award(pg_session, created.id) is None
    await pg_session.refresh(team)
    assert team.total == pytest.approx(30)


async def test_deleting_a_result_removes_its_excess_award(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)

    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 40},
            penalties={"custom": 100},
            is_completed=True,
        )
    )
    assert await _excess_award(pg_session, created.id) is not None
    result_id = created.id

    await svc.remove_result(result_id)
    pg_session.expire_all()

    assert await _excess_award(pg_session, result_id) is None
    await pg_session.refresh(team)
    assert team.total == pytest.approx(0)


# --------------------------------------------------------------------------- #
# G3
# --------------------------------------------------------------------------- #
async def test_create_result_clamps_extra_shots_to_team_limit(pg_session):
    team = await _make_team(pg_session)
    activity = await _make_activity(pg_session)
    svc = ScoringService(pg_session)

    created = await svc.create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team.id,
            result_data={"assigned_points": 10},
            extra_shots=999,
            is_completed=True,
        )
    )

    assert created.final_score == pytest.approx(15)


def _select_result(activity_id: int, team_id: int):
    from sqlalchemy import select

    return select(ActivityResult).where(
        ActivityResult.activity_id == activity_id,
        ActivityResult.team_id == team_id,
    )
