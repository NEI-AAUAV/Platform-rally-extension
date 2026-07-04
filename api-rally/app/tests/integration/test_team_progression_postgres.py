"""Real-schema integration tests for team checkpoint progression.

``add_checkpoint`` is the core write path of the rally (locking, order
validation, MutableList appends, classification update). The mock suite can
only assert around it; here it runs against real Postgres.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.exception import APIException
from app.crud.crud_team import team as crud_team
from app.models.activity import RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.team import TeamScoresUpdate

pytestmark = pytest.mark.asyncio


async def _setup_rally(pg_session, *, order_matters: bool = True):
    event = RallyEvent(name="Edition", event_type="rally_tascas", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    settings = RallySettings(
        event_id=event.id, checkpoint_order_matters=order_matters
    )
    cp1 = CheckPoint(name="CP1", order=1, event_id=event.id)
    cp2 = CheckPoint(name="CP2", order=2, event_id=event.id)
    team = Team(name="Team X", access_code="PRG-0001", event_id=event.id)
    pg_session.add_all([settings, cp1, cp2, team])
    await pg_session.commit()
    for obj in (cp1, cp2, team):
        await pg_session.refresh(obj)
    return event, settings, cp1, cp2, team


async def test_add_checkpoint_in_order_appends_scores_and_times(pg_session) -> None:
    _, _, cp1, cp2, team = await _setup_rally(pg_session)

    updated = await crud_team.add_checkpoint(
        db=pg_session,
        id=team.id,
        checkpoint_id=cp1.id,
        obj_in=TeamScoresUpdate(
            checkpoint_id=cp1.id, question_score=1, time_score=10, pukes=0, skips=0
        ),
    )
    assert len(updated.times) == 1
    assert updated.question_scores == [True]
    assert updated.time_scores == [10]

    updated = await crud_team.add_checkpoint(
        db=pg_session,
        id=team.id,
        checkpoint_id=cp2.id,
        obj_in=TeamScoresUpdate(
            checkpoint_id=cp2.id, question_score=0, time_score=5, pukes=1, skips=0
        ),
    )
    assert len(updated.times) == 2
    assert updated.question_scores == [True, False]
    assert updated.pukes == [0, 1]


async def test_add_checkpoint_out_of_order_rejected(pg_session) -> None:
    _, _, _, cp2, team = await _setup_rally(pg_session, order_matters=True)

    with pytest.raises(APIException) as exc:
        await crud_team.add_checkpoint(
            db=pg_session,
            id=team.id,
            checkpoint_id=cp2.id,
            obj_in=TeamScoresUpdate(
                checkpoint_id=cp2.id, question_score=0, time_score=0, pukes=0, skips=0
            ),
        )
    assert exc.value.status_code == 400


async def test_add_checkpoint_twice_rejected(pg_session) -> None:
    _, _, cp1, _, team = await _setup_rally(pg_session)

    await crud_team.add_checkpoint(
        db=pg_session,
        id=team.id,
        checkpoint_id=cp1.id,
        obj_in=TeamScoresUpdate(
            checkpoint_id=cp1.id, question_score=0, time_score=0, pukes=0, skips=0
        ),
    )
    with pytest.raises(APIException) as exc:
        await crud_team.add_checkpoint(
            db=pg_session,
            id=team.id,
            checkpoint_id=cp1.id,
            obj_in=TeamScoresUpdate(
                checkpoint_id=cp1.id, question_score=0, time_score=0, pukes=0, skips=0
            ),
        )
    assert exc.value.status_code == 400


async def test_add_checkpoint_outside_rally_window_rejected(pg_session) -> None:
    event, settings, cp1, _, team = await _setup_rally(pg_session)
    # The event is the source of truth for timing; get_or_create syncs the
    # settings row from it on every read.
    event.end_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    await pg_session.commit()

    with pytest.raises(APIException) as exc:
        await crud_team.add_checkpoint(
            db=pg_session,
            id=team.id,
            checkpoint_id=cp1.id,
            obj_in=TeamScoresUpdate(
                checkpoint_id=cp1.id, question_score=0, time_score=0, pukes=0, skips=0
            ),
        )
    assert exc.value.status_code == 400
    assert "ended" in exc.value.detail.lower()
