"""Guide field tools, against real Postgres.

Three things a guide accompanying a team needs and did not have: a route
scoped to their team's current post (in a peddy paper the full route is the
answer key), a way to mark that team as arrived when GPS fails, and sight of
which hints the team already paid to unlock. A guide is assigned to one team
rather than a fixed post; the checkpoint they may act on is whichever one
their team hasn't resolved yet (see GuideService.current_checkpoint_id).
"""

import pytest

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.main import app
from app.models.activity import Activity, EventType
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event

CHECKPOINTS_URL = "/api/rally/v1/guide/checkpoints"
TEAMS_URL = "/api/rally/v1/guide/checkpoints/{id}/teams"
ARRIVALS_URL = "/api/rally/v1/guide/checkpoints/{id}/arrivals"

GUIDE_USER_ID = 42


@pytest.fixture
def as_guide():
    """A plain guide: no admin/staff scopes, so assignment scoping applies."""
    from app.api import deps
    from app.api.auth import AuthData, api_nei_auth, api_nei_auth_optional
    from app.schemas.user import DetailedUser

    user = DetailedUser(id=GUIDE_USER_ID, name="Guia Zé", disabled=False, scopes=["rally-guide"])
    auth = AuthData(oidc_sub="guide-sub", name="Guia Zé", scopes=["rally-guide"])
    app.dependency_overrides[api_nei_auth] = lambda: auth
    app.dependency_overrides[api_nei_auth_optional] = lambda: auth
    app.dependency_overrides[deps.get_guide] = lambda: user
    app.dependency_overrides[deps.get_participant] = lambda: user
    try:
        yield user
    finally:
        for dep in (api_nei_auth, api_nei_auth_optional, deps.get_guide, deps.get_participant):
            app.dependency_overrides.pop(dep, None)


async def _make_event(pg_session):
    return await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order, event_id=None):
    obj = await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Tasca Secreta {order}",
            order=order,
            latitude=41.0,
            longitude=-8.0,
            arrival_radius_m=50,
        ),
        commit=True,
    )
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _assign_guide(pg_session, team_id):
    pg_session.add(RallyGuideAssignment(user_id=GUIDE_USER_ID, team_id=team_id))
    await pg_session.commit()


async def _make_team(pg_session, name="TeamA", event_id=None):
    obj = await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _enable_guide_mode(pg_session):
    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data.update({"guide_mode_enabled": True, "guide_mode_active": True})
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
    )


class TestRouteScoping:
    async def test_an_assigned_guide_sees_the_whole_route_with_current_flagged(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        await _make_checkpoint(pg_session, order=1, event_id=event.id)
        await _make_checkpoint(pg_session, order=2, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.get(CHECKPOINTS_URL)

        # A guide accompanies their team through the whole route, so they see
        # every post — the team hasn't resolved anything yet, so only order 1
        # is flagged as current.
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert [cp["order"] for cp in body] == [1, 2]
        assert [cp["is_current"] for cp in body] == [True, False]

    async def test_an_unassigned_guide_still_sees_the_route(self, pg_session, pg_client, as_guide):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        await _make_checkpoint(pg_session, order=1, event_id=event.id)
        await _make_checkpoint(pg_session, order=2, event_id=event.id)

        resp = pg_client.get(CHECKPOINTS_URL)

        # An admin who forgot to assign them would otherwise leave a guide with
        # a blank screen mid-event, which is worse than the leak it prevents.
        # No team assigned means no post is flagged as current either.
        body = resp.json()
        assert [cp["order"] for cp in body] == [1, 2]
        assert [cp["is_current"] for cp in body] == [False, False]

    async def test_an_admin_sees_the_whole_route_with_nothing_flagged(
        self, pg_session, pg_client, as_admin
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        await _make_checkpoint(pg_session, order=1, event_id=event.id)
        await _make_checkpoint(pg_session, order=2, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.get(CHECKPOINTS_URL)

        # Staff and admins run the event; there is no single "current" post
        # for them.
        body = resp.json()
        assert [cp["order"] for cp in body] == [1, 2]
        assert [cp["is_current"] for cp in body] == [False, False]


class TestManualArrival:
    async def test_guide_marks_a_team_as_arrived_without_gps(self, pg_session, pg_client, as_guide):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})

        assert resp.status_code == 201, resp.text
        assert resp.json()["already_registered"] is False
        # No activities here, so the post completes on arrival exactly as it
        # would through the GPS path.
        assert resp.json()["auto_completed"] is True

    async def test_guide_cannot_mark_a_different_team_arrived(
        self, pg_session, pg_client, as_guide
    ):
        """A guide accompanies a single assigned team, and may only vouch for
        that team's arrival — never another team passing through the same
        post."""
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        my_team = await _make_team(pg_session, name="MyTeam", event_id=event.id)
        other_team = await _make_team(pg_session, name="OtherTeam", event_id=event.id)
        await _assign_guide(pg_session, my_team.id)

        resp = pg_client.post(
            ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": other_team.id}
        )

        assert resp.status_code == 403, resp.text

    async def test_guide_can_mark_their_own_assigned_team_arrived(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        my_team = await _make_team(pg_session, name="MyTeam", event_id=event.id)
        await _assign_guide(pg_session, my_team.id)

        resp = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": my_team.id})

        assert resp.status_code == 201, resp.text
        assert resp.json()["team_id"] == my_team.id

    async def test_a_post_with_an_activity_still_waits_for_staff(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        pg_session.add(
            Activity(
                checkpoint_id=checkpoint.id,
                is_active=True,
                name="Prova",
                activity_type="generic",
            )
        )
        await pg_session.commit()
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})

        # Arrival is not completion: the evaluation still gates progression.
        assert resp.json()["auto_completed"] is False

    async def test_marking_the_same_team_twice_is_idempotent(self, pg_session, pg_client, as_guide):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})
        second = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})

        assert second.status_code == 201
        assert second.json()["already_registered"] is True

    async def test_a_guide_cannot_mark_arrivals_at_another_post(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        await _make_checkpoint(pg_session, order=1, event_id=event.id)
        other = await _make_checkpoint(pg_session, order=2, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        # The team hasn't resolved order 1 yet, so the guide's current post
        # is order 1 — not `other` (order 2).
        resp = pg_client.post(ARRIVALS_URL.format(id=other.id), json={"team_id": team.id})

        # Writing progress for a post the team is not at is not something to
        # be lenient about, unlike the read path.
        assert resp.status_code == 403, resp.text

    async def test_an_unassigned_guide_cannot_mark_arrivals(self, pg_session, pg_client, as_guide):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)

        resp = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})

        assert resp.status_code == 403, resp.text

    async def test_the_switch_turns_manual_arrivals_off_server_side(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)
        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["guide_manual_arrival_enabled"] = False
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )

        resp = pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})

        # Hiding the button would not be enough — the endpoint has to refuse.
        assert resp.status_code == 400, resp.text


class TestTeamsAtCheckpoint:
    async def test_lists_arrivals_with_the_hints_the_team_bought(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)
        indication = CheckpointGuideIndication(
            checkpoint_id=checkpoint.id, hint="Segue o rio", order=0
        )
        pg_session.add(indication)
        await pg_session.commit()
        await pg_session.refresh(indication)
        pg_session.add(
            CheckpointHintReveal(
                team_id=team.id,
                checkpoint_id=checkpoint.id,
                indication_id=indication.id,
                cost=-10,
            )
        )
        await pg_session.commit()

        pg_client.post(ARRIVALS_URL.format(id=checkpoint.id), json={"team_id": team.id})
        resp = pg_client.get(TEAMS_URL.format(id=checkpoint.id))

        assert resp.status_code == 200, resp.text
        [row] = resp.json()
        assert row["team_name"] == "TeamA"
        # Without this the guide reads out, for free, the hint the team just
        # paid ten points for.
        assert row["revealed_indication_ids"] == [indication.id]
        assert row["arrived_by_guide"] is True

    async def test_is_empty_before_anyone_arrives(self, pg_session, pg_client, as_guide):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
        team = await _make_team(pg_session, event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.get(TEAMS_URL.format(id=checkpoint.id))

        assert resp.json() == []


class TestGuideOwnTeam:
    async def test_guide_sees_their_assigned_team_with_access_code(
        self, pg_session, pg_client, as_guide
    ):
        event = await _make_event(pg_session)
        await _enable_guide_mode(pg_session)
        team = await _make_team(pg_session, name="MyTeam", event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.get("/api/rally/v1/guide/team")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "MyTeam"
        assert body["access_code"]

    async def test_guide_with_no_assignment_gets_404(self, pg_session, pg_client, as_guide):
        await _make_event(pg_session)
        await _enable_guide_mode(pg_session)

        resp = pg_client.get("/api/rally/v1/guide/team")

        assert resp.status_code == 404

    async def test_guide_team_403_when_guide_mode_off(self, pg_session, pg_client, as_guide):
        """Every guide surface is gated on the two switches, this one included."""
        event = await _make_event(pg_session)
        team = await _make_team(pg_session, name="MyTeam", event_id=event.id)
        await _assign_guide(pg_session, team.id)

        resp = pg_client.get("/api/rally/v1/guide/team")

        assert resp.status_code == 403
