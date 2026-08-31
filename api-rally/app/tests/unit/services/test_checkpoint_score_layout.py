"""``score_per_checkpoint`` is indexed by post order, not by visit count.

A route where some post scores nothing is the normal case — a post with no
activity, a post the team gave up on — and the old layout appended the zeros
at the *end* of an array sized to ``len(team.times)``. Every post after the
unscored one therefore shifted down a slot, and ``last_checkpoint_score``
(which reads the last slot) reported 0 for a team that had just been scored.
The participant screen has always indexed this array by post order.
"""

from app.models.team import Team
from app.services.scoring_service import ScoringService


def _lay_out(*, route_orders, scores_by_order):
    """Run the layout for a route, keyed the way the caller keys it (by id)."""
    # ids are arbitrary and deliberately not in order: the scores are keyed by
    # the stable checkpoint id, so a reorder mid-event lands them in their new
    # slots rather than smearing across the array.
    order_by_id = {100 + order: order for order in route_orders}
    checkpoint_scores = {
        cid: scores_by_order[order]
        for cid, order in order_by_id.items()
        if order in scores_by_order
    }
    team = Team(name="A")
    ScoringService._apply_checkpoint_layout(team, checkpoint_scores, order_by_id, route_orders)
    return team


class TestCheckpointScoreLayout:
    def test_an_unscored_post_holds_a_zero_in_its_own_slot(self):
        # Post 1 has no activity, post 2 scored 10, post 3 scored 5.
        team = _lay_out(route_orders=[1, 2, 3], scores_by_order={2: 10.0, 3: 5.0})

        assert team.score_per_checkpoint == [0, 10, 5]

    def test_last_checkpoint_score_reads_the_last_scored_post(self):
        team = _lay_out(route_orders=[1, 2, 3], scores_by_order={2: 10.0, 3: 5.0})

        assert team.last_checkpoint_score == 5

    def test_a_trailing_unscored_post_does_not_report_the_earlier_score_as_current(self):
        # The team scored at post 1 and is now at the no-activity post 2.
        team = _lay_out(route_orders=[1, 2], scores_by_order={1: 7.0})

        assert team.score_per_checkpoint == [7, 0]
        # The last *non-zero* slot: a zero-scoring post is not a score.
        assert team.last_checkpoint_score == 7

    def test_a_route_with_no_scores_at_all_reports_zero_not_none(self):
        team = _lay_out(route_orders=[1, 2], scores_by_order={})

        assert team.score_per_checkpoint == [0, 0]
        assert team.last_checkpoint_score == 0

    def test_an_empty_route_has_no_last_score(self):
        team = _lay_out(route_orders=[], scores_by_order={})

        assert team.score_per_checkpoint == []
        assert team.last_checkpoint_score is None

    def test_the_array_is_sized_to_the_route_not_to_the_visit_count(self):
        # Three visits recorded, four posts published: the array describes the
        # route, so the unvisited post still has its own slot.
        team = _lay_out(route_orders=[1, 2, 3, 4], scores_by_order={1: 3.0, 3: 8.0})

        assert team.score_per_checkpoint == [3, 0, 8, 0]
