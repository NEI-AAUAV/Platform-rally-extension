"""Tests for app.services.audit_service.

Uses the real-schema `pg_session` fixture (skips locally without Postgres;
see app/tests/conftest.py) since AuditLog rows are real INSERTs, not mocks.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.services._diff import snapshot_fields
from app.services.audit_service import AuditActor, record_audit, record_field_changes


class _Snapshotable:
    """Minimal stand-in object with attribute access, for diff tests."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


async def test_record_audit_writes_a_row(pg_session: AsyncSession) -> None:
    entry = await record_audit(
        pg_session,
        action="rally_settings.updated",
        actor=AuditActor(id="1", name="Admin", kind="staff"),
        target_type="rally_settings",
        target_id="1",
        changes={"max_teams": {"before": 16, "after": 32}},
    )
    assert entry is not None
    assert entry.id is not None

    rows = (await pg_session.scalars(select(AuditLog))).all()
    assert len(rows) == 1
    assert rows[0].action == "rally_settings.updated"
    assert rows[0].changes == {"max_teams": {"before": 16, "after": 32}}


async def test_record_audit_writes_nothing_when_changes_explicitly_empty(
    pg_session: AsyncSession,
) -> None:
    entry = await record_audit(
        pg_session,
        action="rally_settings.updated",
        actor=AuditActor(id="1", name="Admin", kind="staff"),
        target_type="rally_settings",
        target_id="1",
        changes={},
    )
    assert entry is None
    rows = (await pg_session.scalars(select(AuditLog))).all()
    assert rows == []


async def test_record_audit_writes_when_changes_omitted(pg_session: AsyncSession) -> None:
    """Actions with no field-level change (check-ins, exports) pass no
    `changes` at all and must still be recorded — distinct from explicitly
    passing an empty dict, which means "diffed and nothing changed"."""
    entry = await record_audit(
        pg_session,
        action="checkin.self_checkin",
        actor=AuditActor(id="5", name="Team Five", kind="team"),
        target_type="team",
        target_id="5",
        note="checkpoint_id=1",
    )
    assert entry is not None
    rows = (await pg_session.scalars(select(AuditLog))).all()
    assert len(rows) == 1
    assert rows[0].changes == {}


async def test_record_field_changes_diffs_and_records(pg_session: AsyncSession) -> None:
    before = _Snapshotable(max_teams=16, event_name="Old")
    after = _Snapshotable(max_teams=32, event_name="Old")

    entry = await record_field_changes(
        pg_session,
        before=snapshot_fields(before, ("max_teams", "event_name")),
        after=after,
        fields=("max_teams", "event_name"),
        action="rally_settings.updated",
        actor=AuditActor(id="1", name="Admin", kind="staff"),
        target_type="rally_settings",
        target_id="1",
    )
    assert entry is not None
    assert entry.changes == {"max_teams": {"before": 16, "after": 32}}


async def test_record_field_changes_writes_nothing_when_no_diff(pg_session: AsyncSession) -> None:
    before = _Snapshotable(max_teams=16)
    after = _Snapshotable(max_teams=16)

    entry = await record_field_changes(
        pg_session,
        before=snapshot_fields(before, ("max_teams",)),
        after=after,
        fields=("max_teams",),
        action="rally_settings.updated",
        actor=AuditActor(id="1", name="Admin", kind="staff"),
        target_type="rally_settings",
        target_id="1",
    )
    assert entry is None
    rows = (await pg_session.scalars(select(AuditLog))).all()
    assert rows == []


async def test_record_audit_never_mutates_existing_rows(pg_session: AsyncSession) -> None:
    """Rows are append-only — recording twice produces two rows, not an update."""
    for _ in range(2):
        await record_audit(
            pg_session,
            action="export.leaderboard",
            actor=AuditActor(id="1", name="Admin", kind="staff"),
            target_type="rally_event",
            target_id="1",
        )
    rows = (await pg_session.scalars(select(AuditLog))).all()
    assert len(rows) == 2
