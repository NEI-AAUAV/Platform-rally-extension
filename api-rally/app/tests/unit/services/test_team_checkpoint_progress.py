"""Per-post progress is keyed by checkpoint id, never by array position.

``Team.times`` is a visit-order log and ``Team.score_per_checkpoint`` a
route-order layout, so a client reading ``times[order - 1]`` got the arrival
time of whichever post happened to be visited in that slot. The read model
built here answers "team X at checkpoint Y" straight from the identity-keyed
rows (arrivals, skips, results), so reordering the route cannot remap it.
"""

from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.team_checkpoint_progress import build_checkpoint_progress

T0 = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)


def _cp(cp_id: int, order: int) -> SimpleNamespace:
    return SimpleNamespace(id=cp_id, order=order, name=f"Posto {order}")


def _act(act_id: int, cp_id: int, *, active: bool = True) -> SimpleNamespace:
    return SimpleNamespace(id=act_id, checkpoint_id=cp_id, is_active=active)


def _result(act_id: int, score: float | None, *, at: datetime = T0) -> SimpleNamespace:
    return SimpleNamespace(
        activity_id=act_id,
        final_score=score,
        is_completed=score is not None,
        is_scored=score is not None,
        completed_at=at if score is not None else None,
    )


def _by_id(rows):
    return {row.checkpoint_id: row for row in rows}


class TestBuildCheckpointProgress:
    def test_unvisited_post_is_pending(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: [_act(1, 10)]},
            arrivals={},
            skips={},
            results=[],
        )

        assert rows[0].status == "pending"
        assert rows[0].arrived_at is None
        assert rows[0].score is None

    def test_arrived_but_unscored_post_is_arrived(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: [_act(1, 10)]},
            arrivals={10: T0},
            skips={},
            results=[],
        )

        assert rows[0].status == "arrived"
        assert rows[0].arrived_at == T0

    def test_scored_post_is_completed_with_summed_score(self) -> None:
        later = T0.replace(hour=11)
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: [_act(1, 10), _act(2, 10)]},
            arrivals={10: T0},
            skips={},
            results=[_result(1, 7.0), _result(2, 3.0, at=later)],
        )

        assert rows[0].status == "completed"
        assert rows[0].score == 10
        assert rows[0].completed_at == later

    def test_no_activity_post_completes_on_arrival(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: []},
            arrivals={10: T0},
            skips={},
            results=[],
        )

        assert rows[0].status == "completed"
        assert rows[0].completed_at == T0

    def test_skip_wins_and_carries_its_cost(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: [_act(1, 10)]},
            arrivals={10: T0},
            skips={10: -50},
            results=[],
        )

        assert rows[0].status == "skipped"
        assert rows[0].skip_cost == -50

    def test_reordering_the_route_keeps_each_post_its_own_data(self) -> None:
        # Visited post id 20 first, then id 10. Then an admin swapped orders.
        arrivals = {20: T0, 10: T0.replace(hour=12)}
        before = _by_id(
            build_checkpoint_progress(
                checkpoints=[_cp(10, 1), _cp(20, 2)],
                activities={10: [], 20: []},
                arrivals=arrivals,
                skips={},
                results=[],
            )
        )
        after = _by_id(
            build_checkpoint_progress(
                checkpoints=[_cp(20, 1), _cp(10, 2)],
                activities={10: [], 20: []},
                arrivals=arrivals,
                skips={},
                results=[],
            )
        )

        assert before[20].arrived_at == after[20].arrived_at == T0
        assert after[20].checkpoint_order == 1

    def test_rows_are_sorted_by_route_order(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(20, 2), _cp(10, 1)],
            activities={},
            arrivals={},
            skips={},
            results=[],
        )

        assert [r.checkpoint_order for r in rows] == [1, 2]

    def test_hide_scores_blanks_score_and_skip_cost(self) -> None:
        rows = build_checkpoint_progress(
            checkpoints=[_cp(10, 1)],
            activities={10: [_act(1, 10)]},
            arrivals={10: T0},
            skips={},
            results=[_result(1, 7.0)],
            hide_scores=True,
        )

        assert rows[0].status == "completed"
        assert rows[0].score is None
