"""Shared field-level diffing for audit trails.

Used by both ``ScoringService`` (evaluation edits) and ``audit_service``
(everything else) so the two audit trails compute "what changed" the same
way: explicit field list (never "every column", so timestamps and unrelated
bookkeeping never show up as spurious diffs), deep-copied snapshot before the
mutation, diffed against a snapshot after.
"""

import copy
from typing import Any


def snapshot_fields(obj: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    """Deep-copy the named attributes of ``obj`` for later diffing."""
    return {field: copy.deepcopy(getattr(obj, field)) for field in fields}


def diff_snapshots(
    before: dict[str, Any], after: dict[str, Any], fields: tuple[str, ...]
) -> dict[str, dict[str, Any]]:
    """Field-level {field: {"before", "after"}} for values that changed."""
    return {
        field: {"before": before[field], "after": after[field]}
        for field in fields
        if before.get(field) != after.get(field)
    }
