"""Unit tests for ActivityResult.is_scored (M2) — pure logic, no DB needed."""

from app.models.activity import ActivityResult


def _result(*, is_completed: bool, final_score: float | None) -> ActivityResult:
    return ActivityResult(
        activity_id=1,
        team_id=1,
        result_data={},
        is_completed=is_completed,
        final_score=final_score,
    )


def test_is_scored_true_for_normal_completed_result() -> None:
    assert _result(is_completed=True, final_score=42.0).is_scored is True


def test_is_scored_false_when_not_completed() -> None:
    assert _result(is_completed=False, final_score=None).is_scored is False


def test_is_scored_false_for_deferred_judged_capture_awaiting_judgment() -> None:
    """M2 regression: a deferred-judged capture sets is_completed=True at
    capture time (media uploaded), before a judge scores it — final_score
    stays None until judge_result()/mark_judged(). is_scored must say False
    until both are true, or a team could advance past this checkpoint (and
    the progress view show it complete) before anyone actually judged it."""
    assert _result(is_completed=True, final_score=None).is_scored is False


def test_is_scored_false_for_completed_flag_without_score_edge_case() -> None:
    """Defensive: is_completed True with no final_score, whatever the cause,
    must never count as scored."""
    assert _result(is_completed=True, final_score=None).is_scored is False
