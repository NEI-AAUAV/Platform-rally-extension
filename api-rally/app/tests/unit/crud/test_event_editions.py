"""Tests for the multi-event (edition) foundation, against real Postgres.

Covers the RallyEvent CRUD invariants (single current event, lazy bootstrap,
slugging) and the per-event settings resolver, exercising real SQL instead of
an AsyncMock session.
"""
import pytest

from app.crud.crud_activity import rally_event, _slugify
from app.models.activity import EventType
from app.schemas.activity import RallyEventCreate, RallyEventUpdate


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Rally Tascas", "rally-tascas"),
        ("Peddy Paper 2026!", "peddy-paper-2026"),
        ("  Spaces  ", "spaces"),
        ("***", "event"),
        ("", "event"),
    ],
)
def test_slugify(value: str, expected: str) -> None:
    assert _slugify(value) == expected


async def test_set_current_missing_event_returns_none(pg_session) -> None:
    result = await rally_event.set_current(pg_session, event_id=42)

    assert result is None


async def test_set_current_demotes_others_and_promotes_target(pg_session) -> None:
    previous = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Previous", is_current=True)
    )
    target = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Target", is_current=False)
    )

    result = await rally_event.set_current(pg_session, event_id=target.id)

    assert result.id == target.id
    assert result.is_current is True

    refreshed_previous = await rally_event.get(pg_session, id=previous.id)
    assert refreshed_previous.is_current is False


async def test_ensure_current_returns_existing_without_creating(pg_session) -> None:
    existing = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Existing", is_current=True)
    )

    result = await rally_event.ensure_current(pg_session)

    assert result.id == existing.id
    all_events = await rally_event.get_multi(pg_session)
    assert len(all_events) == 1


async def test_ensure_current_adopts_existing_non_current(pg_session) -> None:
    orphan = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Orphan", is_current=False)
    )

    result = await rally_event.ensure_current(pg_session)

    assert result.id == orphan.id
    assert result.is_current is True


async def test_ensure_current_creates_default_when_empty(pg_session) -> None:
    result = await rally_event.ensure_current(pg_session)

    assert result.is_current is True
    assert result.event_type == EventType.RALLY_TASCAS.value
    assert result.slug == "rally-tascas"


async def test_create_duplicate_slug_gets_suffixed(pg_session) -> None:
    first = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Rally Tascas"))
    second = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Rally Tascas"))

    assert first.slug == "rally-tascas"
    assert second.slug == "rally-tascas-2"


async def test_update_promoting_to_current_demotes_others(pg_session) -> None:
    previous = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Previous", is_current=True)
    )
    target = await rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Target", is_current=False)
    )

    await rally_event.update(pg_session, db_obj=target, obj_in=RallyEventUpdate(is_current=True))

    refreshed_previous = await rally_event.get(pg_session, id=previous.id)
    assert refreshed_previous.is_current is False
