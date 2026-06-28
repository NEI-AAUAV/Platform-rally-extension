"""Real-schema integration tests for Team — exercises Postgres ARRAY columns
and the event-scoped listing query, neither of which the mock-based suite can
cover (the ORM's ARRAY types cannot be created on SQLite).
"""

from datetime import datetime

import pytest
from sqlalchemy import select

from app.crud.crud_team import team as crud_team
from app.models.activity import RallyEvent
from app.models.team import Team

pytestmark = pytest.mark.asyncio


async def _make_current_event(session, name: str = "Edition A") -> RallyEvent:
    event = RallyEvent(name=name, event_type="rally_tascas", is_current=True)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def test_array_columns_round_trip(pg_session) -> None:
    """ARRAY columns (score_per_checkpoint, times, pukes) survive a real
    Postgres write/read cycle with their values and order intact."""
    event = await _make_current_event(pg_session)

    team = Team(
        name="Team Array",
        access_code="ARR-0001",
        event_id=event.id,
        score_per_checkpoint=[10, 0, 25],
        times=[datetime(2026, 6, 28, 12, 0, 0)],
        pukes=[1, 0, 2],
        total=35,
    )
    pg_session.add(team)
    await pg_session.commit()
    pg_session.expunge_all()

    loaded = await pg_session.scalar(select(Team).where(Team.access_code == "ARR-0001"))
    assert loaded is not None
    assert loaded.score_per_checkpoint == [10, 0, 25]
    assert loaded.pukes == [1, 0, 2]
    assert loaded.total == 35
    assert loaded.times[0] == datetime(2026, 6, 28, 12, 0, 0)


async def test_get_multi_is_scoped_to_current_event(pg_session) -> None:
    """crud_team.get_multi returns only the current event's teams, plus legacy
    rows whose event_id is NULL — the real event-scoped SQL the mocks skip."""
    current = await _make_current_event(pg_session, "Current")
    other = RallyEvent(name="Other", event_type="rally_tascas", is_current=False)
    pg_session.add(other)
    await pg_session.commit()
    await pg_session.refresh(other)

    pg_session.add_all(
        [
            Team(name="In current", access_code="CUR-1", event_id=current.id),
            Team(name="Legacy null", access_code="NUL-1", event_id=None),
            Team(name="In other", access_code="OTH-1", event_id=other.id),
        ]
    )
    await pg_session.commit()

    teams = await crud_team.get_multi(pg_session)
    names = {t.name for t in teams}

    assert "In current" in names
    assert "Legacy null" in names  # NULL folds into the current edition
    assert "In other" not in names
