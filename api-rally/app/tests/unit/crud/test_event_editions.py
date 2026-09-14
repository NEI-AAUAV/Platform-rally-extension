"""Tests for the multi-event (edition) foundation, against real Postgres.

Covers the RallyEvent CRUD invariants (single current event, lazy bootstrap,
slugging) and the per-event settings resolver, exercising real SQL instead of
an AsyncMock session.
"""

import pytest

from app.crud.crud_activity import _slugify, rally_event
from app.domain.event_configuration.policies import EventProfile
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
    assert result.event_profile == EventProfile.STAFFED.value
    assert result.config["drinking_scoring"] is True
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


async def test_update_event_rejects_changing_domain_config_keys(pg_session) -> None:
    from app.core.exceptions import RallyConfigurationError

    event = await rally_event.create(
        pg_session,
        obj_in=RallyEventCreate(
            name="Rally Config Test",
            event_type=EventType.RALLY_TASCAS,
            config={"drinking_scoring": True},
        ),
    )
    update = RallyEventUpdate(config={"drinking_scoring": False})

    with pytest.raises(RallyConfigurationError) as exc_info:
        await rally_event.update(pg_session, db_obj=event, obj_in=update)
    assert exc_info.value.details["issues"][0]["code"] == "RESERVED_EVENT_CONFIG_KEY"


async def test_update_event_non_destructively_merges_config(pg_session) -> None:
    event = await rally_event.create(
        pg_session,
        obj_in=RallyEventCreate(
            name="Rally Merge Test",
            config={"custom_key": 123, "drinking_scoring": True},
        ),
    )
    updated = await rally_event.update(
        pg_session,
        db_obj=event,
        obj_in=RallyEventUpdate(config={"another_key": "val"}),
    )
    assert updated.config["custom_key"] == 123
    assert updated.config["drinking_scoring"] is True
    assert updated.config["another_key"] == "val"


async def test_create_event_reconciles_config(pg_session) -> None:
    # Peddy paper forbids drinking scoring
    event = await rally_event.create(
        pg_session,
        obj_in=RallyEventCreate(
            name="Peddy Autonomous Create",
            event_type=EventType.PEDDY_PAPER,
            event_profile="autonomous",
            config={"drinking_scoring": True},
        ),
    )
    # Reconciler should have forced drinking_scoring to False
    assert event.config["drinking_scoring"] is False
