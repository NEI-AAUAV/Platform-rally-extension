"""Real-schema integration tests for Team — exercises the event-scoped listing
query, which the mock-based suite cannot cover.
"""

import pytest

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


async def test_get_multi_is_scoped_to_current_event(pg_session) -> None:
    """crud_team.get_multi returns only the current event's teams — the real
    event-scoped SQL the mocks skip. Editions never bleed into each other."""
    current = await _make_current_event(pg_session, "Current")
    other = RallyEvent(name="Other", event_type="rally_tascas", is_current=False)
    pg_session.add(other)
    await pg_session.commit()
    await pg_session.refresh(other)

    pg_session.add_all(
        [
            Team(name="In current", access_code="CUR-1", event_id=current.id),
            Team(name="In other", access_code="OTH-1", event_id=other.id),
        ]
    )
    await pg_session.commit()

    teams = await crud_team.get_multi(pg_session)
    names = {t.name for t in teams}

    assert "In current" in names
    assert "In other" not in names
