"""Who may write an activity result, and for which post.

One rule across every route that creates or changes one: **staff score at
their own post and nowhere else.**

These routes used to guard with the context-free `require(...)` dependency.
The staff rule for these actions is `_staff_own_checkpoint`, which is false
whenever `checkpoint_id` is None, so the guard collapsed to admins-only and
denied every rally-staff member — including the one standing at the post with
the team in front of them. They now resolve the post from the activity, which
is what lets the rule mean what it says.

Both halves are asserted for each route: simply dropping the guard would have
let any staff member score any post in the event, which is worse than the bug
being fixed.
"""

import pytest

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_activity import activity_result as crud_activity_result
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.models.activity import ActivityResult
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event

RESULTS_URL = "/api/rally/v1/activities/results/"


async def _make_post(pg_session, order, name):
    checkpoint = await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=name, order=order), commit=True
    )
    activity = await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name=f"{name} activity",
            activity_type=ActivityType.BOOLEAN,
            checkpoint_id=checkpoint.id,
            config={"success_points": 100, "failure_points": 0},
            is_active=True,
        ),
    )
    return checkpoint, activity


def _create_result(pg_client, *, activity_id, team_id):
    return pg_client.post(
        RESULTS_URL,
        json={
            "activity_id": activity_id,
            "team_id": team_id,
            "result_data": {"success": True},
            "extra_shots": 0,
            "penalties": {},
        },
    )


@pytest.fixture
async def two_posts(pg_session):
    """Two posts in one event, each with an activity, and a team."""
    await make_event(pg_session)
    mine, mine_activity = await _make_post(pg_session, 1, "Mine")
    theirs, theirs_activity = await _make_post(pg_session, 2, "Theirs")
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team A"), commit=True)
    other_team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team B"), commit=True)

    # Head-to-head needs its own activity type: settling a match against a
    # boolean activity is rejected by the scoring engine long before any
    # permission question is reached.
    mine_vs = await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Mine versus",
            activity_type=ActivityType.TEAM_VS,
            checkpoint_id=mine.id,
            config={"win_points": 100, "draw_points": 50, "lose_points": 0},
            is_active=True,
        ),
    )
    theirs_vs = await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Theirs versus",
            activity_type=ActivityType.TEAM_VS,
            checkpoint_id=theirs.id,
            config={"win_points": 100, "draw_points": 50, "lose_points": 0},
            is_active=True,
        ),
    )
    return {
        "mine": mine,
        "mine_activity": mine_activity,
        "mine_vs": mine_vs,
        "theirs": theirs,
        "theirs_activity": theirs_activity,
        "theirs_vs": theirs_vs,
        "team": team,
        "other_team": other_team,
    }


async def _seed_result(pg_session, *, activity_id, team_id):
    """A result row seeded straight through CRUD.

    Deliberately not created through the API: the endpoint that creates one is
    itself under test here, and stacking the `as_admin` fixture on top of
    `as_staff` to seed it would just swap the identity of every later request
    in the test.
    """
    return await crud_activity_result.persist(
        pg_session,
        ActivityResult(
            activity_id=activity_id,
            team_id=team_id,
            result_data={"success": True},
            extra_shots=0,
            penalties={},
        ),
    )


class TestStaffScoreTheirOwnPost:
    async def test_staff_creates_a_result_at_their_own_post(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        response = _create_result(
            pg_client,
            activity_id=two_posts["mine_activity"].id,
            team_id=two_posts["team"].id,
        )

        assert response.status_code < 400, response.text

    async def test_staff_cannot_create_a_result_at_another_post(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        response = _create_result(
            pg_client,
            activity_id=two_posts["theirs_activity"].id,
            team_id=two_posts["team"].id,
        )

        assert response.status_code == 403

    async def test_staff_with_no_post_at_all_is_refused(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        as_staff.staff_checkpoint_id = None

        response = _create_result(
            pg_client,
            activity_id=two_posts["mine_activity"].id,
            team_id=two_posts["team"].id,
        )

        assert response.status_code == 403

    async def test_staff_corrects_their_own_result_but_not_another_post_s(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        mine = await _seed_result(
            pg_session, activity_id=two_posts["mine_activity"].id, team_id=two_posts["team"].id
        )
        theirs = await _seed_result(
            pg_session, activity_id=two_posts["theirs_activity"].id, team_id=two_posts["team"].id
        )
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        own = pg_client.put(f"{RESULTS_URL}{mine.id}", json={"result_data": {"success": False}})
        assert own.status_code < 400, own.text

        foreign = pg_client.put(
            f"{RESULTS_URL}{theirs.id}", json={"result_data": {"success": False}}
        )
        assert foreign.status_code == 403

    async def test_extra_shots_and_penalties_follow_the_same_rule(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        mine = await _seed_result(
            pg_session, activity_id=two_posts["mine_activity"].id, team_id=two_posts["team"].id
        )
        theirs = await _seed_result(
            pg_session, activity_id=two_posts["theirs_activity"].id, team_id=two_posts["team"].id
        )
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        assert pg_client.post(f"{RESULTS_URL}{mine.id}/extra-shots?extra_shots=1").status_code < 400
        assert (
            pg_client.post(f"{RESULTS_URL}{theirs.id}/extra-shots?extra_shots=1").status_code == 403
        )

        assert (
            pg_client.post(
                f"{RESULTS_URL}{mine.id}/penalty?penalty_type=vomit&penalty_count=1"
            ).status_code
            < 400
        )
        assert (
            pg_client.post(
                f"{RESULTS_URL}{theirs.id}/penalty?penalty_type=vomit&penalty_count=1"
            ).status_code
            == 403
        )

    async def test_a_missing_activity_reads_as_not_found_not_as_denied(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        """Resolving the post must not turn a bad id into a permission error.

        A 403 here would send a staff member hunting for an access problem
        that does not exist.
        """
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        response = _create_result(pg_client, activity_id=99_999_999, team_id=two_posts["team"].id)

        assert response.status_code == 404


class TestNobodyElseWrites:
    async def test_a_participant_with_no_rally_role_is_refused(
        self, pg_session, pg_client, as_user, two_posts
    ):
        """A logged-in student is not staff at nowhere; they are not staff.

        The guard resolves a post in order to *narrow* staff, so it has to keep
        refusing everyone who was never in the table to begin with.
        """
        response = _create_result(
            pg_client,
            activity_id=two_posts["mine_activity"].id,
            team_id=two_posts["team"].id,
        )

        assert response.status_code >= 400


class TestTeamVsFollowsTheSameRule:
    def _settle(self, pg_client, *, activity_id, team1, team2, winner):
        return pg_client.post(
            f"/api/rally/v1/activities/team-vs/{activity_id}"
            f"?team1_id={team1}&team2_id={team2}&winner_id={winner}",
            json={"completed": True},
        )

    async def test_staff_settles_a_match_at_their_own_post(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        response = self._settle(
            pg_client,
            activity_id=two_posts["mine_vs"].id,
            team1=two_posts["team"].id,
            team2=two_posts["other_team"].id,
            winner=two_posts["team"].id,
        )

        assert response.status_code == 200, response.text

    async def test_staff_cannot_settle_a_match_at_another_post(
        self, pg_session, pg_client, as_staff, two_posts
    ):
        as_staff.staff_checkpoint_id = two_posts["mine"].id

        response = self._settle(
            pg_client,
            activity_id=two_posts["theirs_vs"].id,
            team1=two_posts["team"].id,
            team2=two_posts["other_team"].id,
            winner=two_posts["team"].id,
        )

        assert response.status_code == 403


class TestAdminIsNotConfinedToAPost:
    async def test_admin_scores_any_post(self, pg_session, pg_client, as_admin, two_posts):
        """The guard narrows staff; it must not narrow admins, who have no
        post of their own at all."""
        for activity in (two_posts["mine_activity"], two_posts["theirs_activity"]):
            response = _create_result(
                pg_client, activity_id=activity.id, team_id=two_posts["team"].id
            )
            assert response.status_code < 400, response.text
