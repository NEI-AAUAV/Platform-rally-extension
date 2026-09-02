"""P1 regression tests: every "source commit -> derived commit" pair collapsed
into a single durability boundary.

Each test injects a failure into the *derived* step (classification / team-score
recompute) and asserts the *source* row (checkpoint append, skip, hint reveal,
activity delete) rolled back with it, instead of being left committed with the
derived state stale.

Real Postgres only (savepoints + real transaction semantics); skips without it.
"""

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_skip import CheckpointSkip
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.team import TeamScoresUpdate
from app.services.checkpoint_visits import insert_arrival, record_visit
from app.services.hint_service import HintService
from app.services.skip_service import SkipService
from app.services.team_service import TeamService

pytestmark = pytest.mark.asyncio


async def _setup(pg_session, **settings_kw):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="P1 Edition", event_type="peddy_paper", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    settings = RallySettings(event_id=event.id, checkpoint_order_matters=True, **settings_kw)
    cp1 = CheckPoint(name="P1 CP1", order=1, event_id=event.id)
    cp2 = CheckPoint(name="P1 CP2", order=2, event_id=event.id)
    team = Team(name="P1 Team", access_code="P1-0001", event_id=event.id)
    pg_session.add_all([settings, cp1, cp2, team])
    await pg_session.commit()
    for obj in (cp1, cp2, team):
        await pg_session.refresh(obj)
    return event, settings, cp1, cp2, team


async def test_add_checkpoint_rolls_back_append_when_recompute_fails(pg_session, monkeypatch):
    _, _, cp1, _, team = await _setup(pg_session)
    # Read the id out now: the rollback below expires every loaded attribute,
    # and re-reading one afterwards is a lazy load from sync attribute access.
    team_id = team.id
    await insert_arrival(pg_session, team_id=team_id, checkpoint_id=cp1.id)

    monkeypatch.setattr(
        TeamService,
        "update_classification_unlocked",
        AsyncMock(side_effect=RuntimeError("recompute boom")),
    )

    with pytest.raises(RuntimeError):
        await crud_team.add_checkpoint(
            db=pg_session,
            id=team_id,
            checkpoint_id=cp1.id,
            obj_in=TeamScoresUpdate(
                checkpoint_id=cp1.id, question_score=1, time_score=10, pukes=0, skips=0
            ),
        )

    await pg_session.rollback()
    fresh = await pg_session.get(Team, team_id)
    # The append never became durable: no second commit persisted it ahead of
    # the failed recompute.
    assert list(fresh.times) == []
    assert list(fresh.time_scores) == []


async def test_record_visit_reconciles_times_entry_owed_by_existing_arrival(pg_session):
    _, _, cp1, _, team = await _setup(pg_session)

    # Simulate a prior call that committed the arrival then crashed before the
    # team.times stamp: arrival row present, times empty.
    await insert_arrival(pg_session, team_id=team.id, checkpoint_id=cp1.id)
    fresh = await pg_session.get(Team, team.id)
    assert list(fresh.times) == []

    recorded = await record_visit(
        pg_session, team_id=team.id, checkpoint_id=cp1.id, enforce_order=False
    )

    # The arrival already existed, so nothing new was *recorded*...
    assert recorded is False
    # ...but the owed visit timestamp was reconciled instead of lost forever.
    await pg_session.refresh(team)
    assert len(team.times) == 1
    arrivals = await pg_session.scalar(
        select(func.count())
        .select_from(CheckpointArrival)
        .where(CheckpointArrival.team_id == team.id)
    )
    assert arrivals == 1


async def test_skip_rolls_back_when_team_score_recompute_fails(pg_session, monkeypatch):
    _, settings, cp1, _, team = await _setup(pg_session, skip_enabled=True, skip_penalty=-25)
    team_id, cp1_id = team.id, cp1.id

    monkeypatch.setattr(
        "app.services.skip_service.ScoringService.update_team_scores",
        AsyncMock(side_effect=RuntimeError("scorer boom")),
    )

    service = SkipService(pg_session, crud_checkpoint, crud_team)
    with pytest.raises(RuntimeError):
        await service.skip(team_id=team_id, checkpoint_id=cp1_id)

    await pg_session.rollback()
    skips = await pg_session.scalar(
        select(func.count()).select_from(CheckpointSkip).where(CheckpointSkip.team_id == team_id)
    )
    # Before the fix the skip row + award were committed before the recompute,
    # so a scorer failure left the post skipped with team.total stale.
    assert skips == 0


async def test_hint_reveal_rolls_back_when_team_score_recompute_fails(pg_session, monkeypatch):
    _, settings, cp1, _, team = await _setup(pg_session, hints_enabled=True, hint_penalty=-10)
    team_id, cp1_id = team.id, cp1.id
    pg_session.add(
        CheckpointGuideIndication(
            checkpoint_id=cp1_id, order=0, hint="first hint", question="q", expected_answer="a"
        )
    )
    await pg_session.commit()

    monkeypatch.setattr(
        "app.services.hint_service.ScoringService.update_team_scores",
        AsyncMock(side_effect=RuntimeError("scorer boom")),
    )

    service = HintService(pg_session, crud_checkpoint, crud_team)
    with pytest.raises(RuntimeError):
        await service.reveal_next(team_id=team_id, checkpoint_id=cp1_id)

    await pg_session.rollback()
    reveals = await pg_session.scalar(
        select(func.count())
        .select_from(CheckpointHintReveal)
        .where(CheckpointHintReveal.team_id == team_id)
    )
    assert reveals == 0


async def test_activity_delete_is_atomic_with_team_rescore(pg_session, monkeypatch):
    from app.crud.crud_activity import activity as crud_activity
    from app.models.activity import Activity, ActivityResult

    _, _, cp1, _, team_a = await _setup(pg_session)
    team_b = Team(name="P1 Team B", access_code="P1-0002", event_id=team_a.event_id)
    pg_session.add(team_b)
    await pg_session.commit()
    await pg_session.refresh(team_b)

    activity = Activity(
        name="Doomed",
        activity_type="GeneralActivity",
        config={"min_points": 0, "max_points": 100},
        checkpoint_id=cp1.id,
    )
    pg_session.add(activity)
    await pg_session.commit()
    await pg_session.refresh(activity)
    activity_id = activity.id
    team_ids = [team_a.id, team_b.id]
    for tm_id in team_ids:
        pg_session.add(
            ActivityResult(
                activity_id=activity_id,
                team_id=tm_id,
                result_data={"assigned_points": 40},
                final_score=40,
                is_completed=True,
            )
        )
    await pg_session.commit()

    # Fail the recompute for the second team, after the delete has been flushed.
    from app.services.scoring_service import ScoringService

    real_apply = ScoringService._apply_team_score
    calls: list[int] = []

    async def flaky_apply(self, team_id: int):
        calls.append(team_id)
        if len(calls) == 2:
            raise RuntimeError("rescore boom")
        return await real_apply(self, team_id)

    monkeypatch.setattr(ScoringService, "_apply_team_score", flaky_apply)

    with pytest.raises(RuntimeError):
        await crud_activity.remove(db=pg_session, id=activity_id, commit=False)
        await ScoringService(pg_session).recompute_and_commit_team_scores(set(team_ids))

    await pg_session.rollback()
    # The delete was flushed but never committed: activity (and its results)
    # survive, so the standings are never left half-rescored.
    assert await pg_session.get(Activity, activity_id) is not None
    remaining = await pg_session.scalar(
        select(func.count())
        .select_from(ActivityResult)
        .where(ActivityResult.activity_id == activity_id)
    )
    assert remaining == 2
