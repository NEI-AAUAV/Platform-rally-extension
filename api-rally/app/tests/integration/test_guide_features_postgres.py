"""Real-schema integration tests for the guide features (assignments and
checkpoint guide indications).

Exercises the actual Postgres constraints the mock suite cannot: the unique
guide-per-user constraint, FK behaviour, cascade delete of indications with
their checkpoint, and the event-scoped assignment listing.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.crud.crud_checkpoint_guide_indication import checkpoint_guide_indication
from app.crud.crud_rally_guide_assignment import rally_guide_assignment
from app.models.activity import RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.schemas.checkpoint_guide_indication import (
    CheckpointGuideIndicationCreate,
    CheckpointGuideIndicationUpdate,
)

pytestmark = pytest.mark.asyncio


async def _make_event(session, name: str = "Edition A", is_current: bool = True) -> RallyEvent:
    event = RallyEvent(name=name, event_type="rally_tascas", is_current=is_current)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def _make_checkpoint(session, event_id=None, order: int = 1, name: str = "CP") -> CheckPoint:
    cp = CheckPoint(name=f"{name}{order}", order=order, event_id=event_id)
    session.add(cp)
    await session.commit()
    await session.refresh(cp)
    return cp


# ---------- guide assignments ----------


async def test_guide_assignment_create_update_remove_lifecycle(pg_session) -> None:
    event = await _make_event(pg_session)
    cp1 = await _make_checkpoint(pg_session, event.id, order=1)
    cp2 = await _make_checkpoint(pg_session, event.id, order=2)

    created = await rally_guide_assignment.create_or_update(
        pg_session, user_id=7, checkpoint_id=cp1.id
    )
    assert created is not None
    assert created.checkpoint_id == cp1.id

    updated = await rally_guide_assignment.create_or_update(
        pg_session, user_id=7, checkpoint_id=cp2.id
    )
    assert updated is not None
    assert updated.id == created.id  # same row, moved
    assert updated.checkpoint_id == cp2.id

    removed = await rally_guide_assignment.create_or_update(
        pg_session, user_id=7, checkpoint_id=None
    )
    assert removed is None
    assert await rally_guide_assignment.get_by_user_id(pg_session, 7) is None


async def test_guide_assignment_user_id_unique_constraint(pg_session) -> None:
    """The DB itself must refuse two assignment rows for the same guide."""
    event = await _make_event(pg_session)
    cp = await _make_checkpoint(pg_session, event.id, order=1)

    pg_session.add(RallyGuideAssignment(user_id=42, checkpoint_id=cp.id))
    await pg_session.commit()

    pg_session.add(RallyGuideAssignment(user_id=42, checkpoint_id=cp.id))
    with pytest.raises(IntegrityError):
        await pg_session.commit()
    await pg_session.rollback()


async def test_guide_assignment_listing_scoped_to_current_event(pg_session) -> None:
    current = await _make_event(pg_session, "Current", is_current=True)
    other = await _make_event(pg_session, "Other", is_current=False)

    cp_current = await _make_checkpoint(pg_session, current.id, order=1, name="Cur")
    cp_other = await _make_checkpoint(pg_session, other.id, order=1, name="Oth")
    cp_legacy = await _make_checkpoint(pg_session, None, order=9, name="Leg")

    pg_session.add_all(
        [
            RallyGuideAssignment(user_id=1, checkpoint_id=cp_current.id),
            RallyGuideAssignment(user_id=2, checkpoint_id=cp_other.id),
            RallyGuideAssignment(user_id=3, checkpoint_id=cp_legacy.id),
        ]
    )
    await pg_session.commit()

    listed = await rally_guide_assignment.get_multi_with_checkpoint(pg_session)
    listed_users = {a.user_id for a in listed}
    # Current event's assignment and the legacy (NULL event) one; never the
    # other edition's.
    assert 1 in listed_users
    assert 3 in listed_users
    assert 2 not in listed_users


# ---------- guide indications ----------


async def test_guide_indication_crud_roundtrip_and_ordering(pg_session) -> None:
    event = await _make_event(pg_session)
    cp = await _make_checkpoint(pg_session, event.id, order=1)

    second = await checkpoint_guide_indication.create(
        pg_session,
        checkpoint_id=cp.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Second", order=1),
    )
    first = await checkpoint_guide_indication.create(
        pg_session,
        checkpoint_id=cp.id,
        obj_in=CheckpointGuideIndicationCreate(
            hint="First", question="Capital?", expected_answer="Lisboa", order=0
        ),
    )

    listed = await checkpoint_guide_indication.get_by_checkpoint(
        pg_session, checkpoint_id=cp.id
    )
    assert [i.hint for i in listed] == ["First", "Second"]
    assert listed[0].expected_answer == "Lisboa"

    updated = await checkpoint_guide_indication.update(
        pg_session,
        db_obj=first,
        obj_in=CheckpointGuideIndicationUpdate(hint="First v2", order=5),
    )
    assert updated.hint == "First v2"
    assert updated.order == 5

    await checkpoint_guide_indication.delete(pg_session, db_obj=second)
    remaining = await checkpoint_guide_indication.get_by_checkpoint(
        pg_session, checkpoint_id=cp.id
    )
    assert [i.hint for i in remaining] == ["First v2"]


async def test_guide_indications_cascade_delete_with_checkpoint(pg_session) -> None:
    """Deleting a checkpoint removes its indications (ondelete CASCADE)."""
    event = await _make_event(pg_session)
    cp = await _make_checkpoint(pg_session, event.id, order=1)

    await checkpoint_guide_indication.create(
        pg_session,
        checkpoint_id=cp.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Goes away", order=0),
    )

    await pg_session.delete(cp)
    await pg_session.commit()

    orphans = (
        await pg_session.scalars(
            select(CheckpointGuideIndication).where(
                CheckpointGuideIndication.checkpoint_id == cp.id
            )
        )
    ).all()
    assert orphans == []
