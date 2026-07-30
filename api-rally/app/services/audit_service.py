"""Recording helper for the general (non-evaluation) audit trail.

See ``app.models.audit_log.AuditLog`` for what belongs here vs. in
``EvaluationHistory``.
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

# Redundant aliases mark these as deliberate re-exports: callers (e.g.
# app.api.api_v1.rally_settings) take the snapshot helpers from this module
# rather than reaching into the private _diff module.
from app.services._diff import diff_snapshots as diff_snapshots
from app.services._diff import snapshot_fields as snapshot_fields


@dataclass(frozen=True)
class AuditActor:
    """Who performed an audited action."""

    id: str | None
    name: str | None
    kind: str  # "staff" | "team" | "system"


async def record_audit(
    db: AsyncSession,
    *,
    action: str,
    actor: AuditActor,
    target_type: str,
    target_id: str | None = None,
    event_id: int | None = None,
    changes: dict[str, dict[str, Any]] | None = None,
    note: str | None = None,
    request_id: str | None = None,
) -> AuditLog | None:
    """Append an ``AuditLog`` row. Returns None (writes nothing) when
    ``changes`` was explicitly computed as empty — mirrors the
    ``EvaluationHistory`` precedent of not recording a no-op edit. Actions
    with no field-level change (check-ins, exports) should pass
    ``changes=None`` (the default), which always records.
    """
    if changes is not None and not changes:
        return None

    entry = AuditLog(
        event_id=event_id,
        actor_id=actor.id,
        actor_name=actor.name,
        actor_kind=actor.kind,
        action=action,
        target_type=target_type,
        target_id=target_id,
        changes=changes or {},
        note=note,
        request_id=request_id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def record_field_changes(
    db: AsyncSession,
    *,
    before: Any,
    after: Any,
    fields: tuple[str, ...],
    action: str,
    actor: AuditActor,
    target_type: str,
    target_id: str | None = None,
    event_id: int | None = None,
    note: str | None = None,
    request_id: str | None = None,
) -> AuditLog | None:
    """Diff ``before``/``after`` over ``fields`` and record only if changed.

    ``before`` must be a snapshot taken via ``snapshot_fields`` *before* the
    mutation; ``after`` is the object post-mutation.
    """
    changes = diff_snapshots(before, snapshot_fields(after, fields), fields)
    return await record_audit(
        db,
        action=action,
        actor=actor,
        target_type=target_type,
        target_id=target_id,
        event_id=event_id,
        changes=changes,
        note=note,
        request_id=request_id,
    )
