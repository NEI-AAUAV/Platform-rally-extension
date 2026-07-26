"""Unit tests for ActivityService.build_activity_ranking's dict normalization
— no DB needed. The full create_activity/config-merge and HTTP-level ranking
flows are covered in app/tests/api/test_activities.py; this fills the gap on
the dual-key ("score" vs "total_score") fallback that isn't exercised there.
"""

from app.services.activity_service import ActivityService


class TestBuildActivityRanking:
    def test_prefers_score_key_over_total_score(self) -> None:
        # given
        rankings_dict = [
            {"team_id": 1, "team_name": "A", "score": 10.0, "total_score": 99.0, "rank": 1}
        ]

        # when
        result = ActivityService.build_activity_ranking(
            activity_id=1, activity_name="Sprint", rankings_dict=rankings_dict
        )

        # then
        assert result.rankings[0].total_score == 10.0

    def test_falls_back_to_total_score_when_score_absent(self) -> None:
        # given
        rankings_dict = [{"team_id": 1, "team_name": "A", "total_score": 42.0, "rank": 1}]

        # when
        result = ActivityService.build_activity_ranking(
            activity_id=1, activity_name="Sprint", rankings_dict=rankings_dict
        )

        # then
        assert result.rankings[0].total_score == 42.0

    def test_missing_fields_default_to_zero(self) -> None:
        # given
        rankings_dict: list[dict] = [{}]

        # when
        result = ActivityService.build_activity_ranking(
            activity_id=7, activity_name="Sprint", rankings_dict=rankings_dict
        )

        # then
        ranking = result.rankings[0]
        assert ranking.team_id == 0
        assert ranking.team_name == ""
        assert ranking.total_score == 0.0
        assert ranking.activities_completed == 0
        assert ranking.rank == 0

    def test_preserves_activity_id_and_name(self) -> None:
        # given / when
        result = ActivityService.build_activity_ranking(
            activity_id=5, activity_name="Obstacle Course", rankings_dict=[]
        )

        # then
        assert result.activity_id == 5
        assert result.activity_name == "Obstacle Course"
        assert result.rankings == []
