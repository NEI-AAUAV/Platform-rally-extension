"""Badge auto-award trigger taxonomy.

A ``BadgeTrigger`` names *how* a badge is earned. Each trigger has a handler in
``app.badges.evaluators`` that reads the badge's ``criteria`` JSON to decide
which teams should hold it. This is what lets an admin "program" a badge from
the UI: pick a trigger + fill in its params, no code change.

The three values map 1-to-1 with the legacy hardcoded rules so the seeded
badge_definitions keep working after backfill:

    win_activity              <- head_to_head_win
    first_complete_activity   <- first_to_complete_activity
    first_complete_checkpoint <- first_to_complete_checkpoint

To add a new *kind* of rule: add a value here, write a handler, register it in
``_TRIGGER_HANDLERS``, and add its param form to the admin UI. To add a new
*badge that reuses an existing rule*: pure admin data entry, nothing here.
"""

from enum import Enum


class BadgeTrigger(str, Enum):
    """Auto-award rule kinds. String-valued for DB storage in ``trigger_type``."""

    # Won a match of an activity (default TeamVs; overridable via criteria).
    WIN_ACTIVITY = "win_activity"
    # First team to complete a given activity (single-holder).
    FIRST_COMPLETE_ACTIVITY = "first_complete_activity"
    # First team to complete every active activity of a checkpoint (single-holder).
    FIRST_COMPLETE_CHECKPOINT = "first_complete_checkpoint"
    # Completed at least N activities (milestone; criteria: count).
    COMPLETE_N_ACTIVITIES = "complete_n_activities"
    # Completed every active activity across the whole rally (all checkpoints).
    COMPLETE_ALL_CHECKPOINTS = "complete_all_checkpoints"
    # Reached a total score threshold (criteria: min_score).
    SCORE_THRESHOLD = "score_threshold"
    # Completed an activity fast enough (criteria: max_seconds; optional scope).
    FAST_COMPLETE = "fast_complete"


# Legacy BadgeType code -> trigger, used by migration 0017 to backfill the seeds.
LEGACY_CODE_TO_TRIGGER: dict[str, BadgeTrigger] = {
    "head_to_head_win": BadgeTrigger.WIN_ACTIVITY,
    "first_to_complete_activity": BadgeTrigger.FIRST_COMPLETE_ACTIVITY,
    "first_to_complete_checkpoint": BadgeTrigger.FIRST_COMPLETE_CHECKPOINT,
}
