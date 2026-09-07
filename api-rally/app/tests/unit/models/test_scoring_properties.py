"""Property-based tests for relative scoring invariants (Hypothesis).

Covers pure, DB-free scoring math:
- TimeBasedActivity.calculate_relative_ranking_score
- BaseActivity.apply_modifiers

These functions have clean algebraic invariants, so property tests catch
edge cases (ties, single competitor, large penalty) that example-based
tests tend to miss.
"""

from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.activities.score_based import ScoreBasedActivity
from app.models.activities.time_based import TimeBasedActivity

finite_times = st.floats(
    min_value=0.0, max_value=1_000_000.0, allow_nan=False, allow_infinity=False
)


def _make_time_activity(max_points: float = 100.0, min_points: float = 10.0) -> TimeBasedActivity:
    return TimeBasedActivity({"max_points": max_points, "min_points": min_points})


@given(
    times=st.lists(finite_times, min_size=2, max_size=20, unique=True),
)
@settings(max_examples=200)
def test_faster_time_never_scores_less(times: list[float]) -> None:
    """A strictly faster time must never yield a lower (or equal-but-wrong) score
    than a slower time, for the same ranking distribution."""
    activity = _make_time_activity()
    sorted_times = sorted(times)

    scores = [activity.calculate_relative_ranking_score(times, t) for t in sorted_times]

    # Scores must be non-increasing as time increases (faster => same or higher score)
    for earlier, later in zip(scores, scores[1:], strict=False):
        assert earlier >= later


@given(times=st.lists(finite_times, min_size=1, max_size=20, unique=True))
@settings(max_examples=200)
def test_relative_ranking_score_within_bounds(times: list[float]) -> None:
    """Every ranking score stays within [min_points, max_points]."""
    max_points, min_points = 100.0, 10.0
    activity = _make_time_activity(max_points, min_points)

    for t in times:
        score = activity.calculate_relative_ranking_score(times, t)
        assert min_points <= score <= max_points


@given(times=st.lists(finite_times, min_size=2, max_size=20, unique=True))
@settings(max_examples=200)
def test_fastest_time_gets_max_points(times: list[float]) -> None:
    activity = _make_time_activity()
    fastest = min(times)
    assert activity.calculate_relative_ranking_score(times, fastest) == pytest.approx(100.0)


@given(times=st.lists(finite_times, min_size=2, max_size=20, unique=True))
@settings(max_examples=200)
def test_slowest_time_gets_min_points(times: list[float]) -> None:
    activity = _make_time_activity()
    slowest = max(times)
    assert activity.calculate_relative_ranking_score(times, slowest) == pytest.approx(10.0)


@given(
    time=finite_times,
    other_times=st.lists(finite_times, min_size=0, max_size=10),
)
@settings(max_examples=200)
def test_tied_times_get_identical_score(time: float, other_times: list[float]) -> None:
    """Two teams with the exact same completion time must score identically."""
    activity = _make_time_activity()
    times = [time, time, *other_times]

    score_a = activity.calculate_relative_ranking_score(times, time)
    score_b = activity.calculate_relative_ranking_score(times, time)
    assert score_a == score_b


@given(time=finite_times)
@settings(max_examples=50)
def test_lone_competitor_gets_max_points(time: float) -> None:
    activity = _make_time_activity()
    assert activity.calculate_relative_ranking_score([time], time) == pytest.approx(100.0)


# ---------------------------------------------------------------------------
# apply_modifiers: penalties/bonuses invariants
# ---------------------------------------------------------------------------

nonneg_int = st.integers(min_value=0, max_value=1000)
nonneg_float = st.floats(min_value=0.0, max_value=100_000.0, allow_nan=False, allow_infinity=False)


@given(
    base_score=nonneg_float,
    penalties=st.dictionaries(st.text(min_size=1, max_size=10), nonneg_int, max_size=5),
)
@settings(max_examples=200)
def test_penalties_never_increase_score(base_score: float, penalties: dict[str, int]) -> None:
    """Applying any set of non-negative penalties never raises the score above
    the unpenalized result, and the score is never negative."""
    activity = ScoreBasedActivity({})
    # apply_modifiers returns (clamped, raw); these invariants are about the
    # clamped score that actually persists.
    unpenalized, _ = activity.apply_modifiers(base_score, {"extra_shots": 0, "penalties": {}})
    penalized, _ = activity.apply_modifiers(base_score, {"extra_shots": 0, "penalties": penalties})

    assert penalized <= unpenalized
    assert penalized >= 0


@given(
    base_score=nonneg_float,
    extra_shots=nonneg_int,
    bonus_per_shot=st.floats(
        min_value=0.0, max_value=1000.0, allow_nan=False, allow_infinity=False
    ),
)
@settings(max_examples=200)
def test_extra_shots_never_decrease_score(
    base_score: float, extra_shots: int, bonus_per_shot: float
) -> None:
    """More extra-shot bonus never lowers the score below the unmodified base."""
    activity = ScoreBasedActivity({})
    unmodified, _ = activity.apply_modifiers(base_score, {"extra_shots": 0, "penalties": {}})
    modified, _ = activity.apply_modifiers(
        base_score,
        {"extra_shots": extra_shots, "penalties": {}, "bonus_per_shot": bonus_per_shot},
    )

    assert modified >= unmodified


@given(
    base_score=nonneg_float,
    penalty_value=st.integers(min_value=0, max_value=10_000_000),
)
@settings(max_examples=200)
def test_score_floor_is_never_negative(base_score: float, penalty_value: int) -> None:
    """No matter how large the penalty, the final score never drops below 0."""
    activity = ScoreBasedActivity({})
    result, _ = activity.apply_modifiers(
        base_score, {"extra_shots": 0, "penalties": {"huge": penalty_value}}
    )
    assert result >= 0


@given(base_score=nonneg_float)
@settings(max_examples=50)
def test_apply_modifiers_is_deterministic(base_score: float) -> None:
    """Same inputs -> same output (recompute is idempotent / a pure function)."""
    activity = ScoreBasedActivity({})
    modifiers: dict[str, Any] = {
        "extra_shots": 3,
        "penalties": {"vomit": 5, "not_drinking": 2},
        "bonus_per_shot": 4.0,
    }
    first = activity.apply_modifiers(base_score, modifiers)
    second = activity.apply_modifiers(base_score, modifiers)
    assert first == second


@given(
    base_score=nonneg_float,
    bonuses=st.dictionaries(st.text(min_size=1, max_size=10), nonneg_int, max_size=5),
)
@settings(max_examples=200)
def test_bonuses_never_decrease_score(base_score: float, bonuses: dict[str, int]) -> None:
    """Awarding any set of non-negative bonuses never lowers the score below the
    unbonused result — the additive mirror of test_penalties_never_increase_score."""
    activity = ScoreBasedActivity({})
    unbonused, _ = activity.apply_modifiers(base_score, {"extra_shots": 0, "penalties": {}})
    bonused, _ = activity.apply_modifiers(
        base_score, {"extra_shots": 0, "penalties": {}, "bonuses": bonuses}
    )

    assert bonused >= unbonused


@given(
    base_score=nonneg_float,
    bonuses=st.dictionaries(st.text(min_size=1, max_size=10), nonneg_int, min_size=1, max_size=5),
    cap=st.floats(min_value=0.0, max_value=50.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=200)
def test_bonus_total_never_exceeds_the_cap(
    base_score: float, bonuses: dict[str, int], cap: float
) -> None:
    """max_bonus_points truncates the summed bonus, whatever the counters add up to.

    This is what makes "até 5 pontos por performance" a guarantee rather than a
    convention a staff member can overshoot.
    """
    activity = ScoreBasedActivity({})
    unbonused, _ = activity.apply_modifiers(base_score, {"extra_shots": 0, "penalties": {}})
    _, raw = activity.apply_modifiers(
        base_score,
        {"extra_shots": 0, "penalties": {}, "bonuses": bonuses, "max_bonus_points": cap},
    )

    assert raw <= unbonused + cap + 1e-9


@given(
    base_score=nonneg_float,
    bonus=nonneg_int,
    penalty=st.integers(min_value=0, max_value=10_000),
)
@settings(max_examples=200)
def test_bonus_applies_before_the_zero_floor(base_score: float, bonus: int, penalty: int) -> None:
    """A bonus offsets penalties rather than being stacked on top of the floor.

    ``raw`` is base + bonus - penalty (what the excess-penalty award reads),
    and the persisted score is that value floored at 0.
    """
    activity = ScoreBasedActivity({})
    clamped, raw = activity.apply_modifiers(
        base_score,
        {"extra_shots": 0, "penalties": {"p": penalty}, "bonuses": {"b": bonus}},
    )

    assert raw == pytest.approx(base_score + bonus - penalty)
    assert clamped == pytest.approx(max(0.0, raw))


@given(base_score=nonneg_float)
@settings(max_examples=50)
def test_apply_modifiers_is_deterministic_with_bonuses(base_score: float) -> None:
    activity = ScoreBasedActivity({})
    modifiers: dict[str, Any] = {
        "extra_shots": 3,
        "penalties": {"vomit": 5},
        "bonuses": {"performance": 4},
        "max_bonus_points": 5,
        "bonus_per_shot": 4.0,
    }
    assert activity.apply_modifiers(base_score, modifiers) == activity.apply_modifiers(
        base_score, modifiers
    )
