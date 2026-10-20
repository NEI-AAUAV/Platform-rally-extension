"""The current event / settings lookup is memoised per session, never across them.

Almost every request resolves the current event (and the settings row hanging
off it) several times. The memo lives on the session, so one request pays for
the lookup once, and any write, commit or rollback on that session drops it —
so it can never serve a stale answer, and another session never sees it.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.schemas.activity import RallyEventCreate


@contextmanager
def _count_statements(session: AsyncSession) -> Iterator[list[str]]:
    seen: list[str] = []
    engine = session.bind.sync_engine  # type: ignore[union-attr]

    def _on_execute(conn, cursor, statement, *_args):  # type: ignore[no-untyped-def]
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


async def test_second_lookup_in_a_session_hits_no_database(pg_session) -> None:
    first = await rally_event.ensure_current(pg_session)

    with _count_statements(pg_session) as statements:
        second = await rally_event.ensure_current(pg_session)

    assert second is first
    assert statements == []


async def test_settings_lookup_is_memoised_too(pg_session) -> None:
    first = await rally_settings.get_or_create(pg_session)

    with _count_statements(pg_session) as statements:
        second = await rally_settings.get_or_create(pg_session)

    assert second is first
    assert statements == []


async def test_set_current_is_seen_by_the_next_lookup(pg_session) -> None:
    before = await rally_event.ensure_current(pg_session)
    other = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Other edition"))

    await rally_event.set_current(pg_session, event_id=other.id)

    after = await rally_event.ensure_current(pg_session)
    assert after.id == other.id != before.id


async def test_update_to_current_is_seen_by_the_next_lookup(pg_session) -> None:
    from app.schemas.activity import RallyEventUpdate

    await rally_event.ensure_current(pg_session)
    other = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Promoted"))

    await rally_event.update(pg_session, db_obj=other, obj_in=RallyEventUpdate(is_current=True))

    assert (await rally_event.ensure_current(pg_session)).id == other.id


async def test_rollback_drops_the_memo(pg_session) -> None:
    kept = await rally_event.ensure_current(pg_session)
    kept_id = kept.id
    other = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Pending switch"))
    other_id = other.id

    kept.is_current = False
    other.is_current = True
    await pg_session.flush()
    assert (await rally_event.ensure_current(pg_session)).id == other_id

    await pg_session.rollback()

    assert (await rally_event.ensure_current(pg_session)).id == kept_id


async def test_another_session_never_sees_this_sessions_memo(pg_session) -> None:
    await rally_event.ensure_current(pg_session)
    other = await rally_event.create(pg_session, obj_in=RallyEventCreate(name="Elsewhere"))

    maker = async_sessionmaker(pg_session.bind, expire_on_commit=False)
    async with maker() as writer:
        await rally_event.set_current(writer, event_id=other.id)

    async with maker() as fresh:
        assert (await rally_event.ensure_current(fresh)).id == other.id
