"""Tests for half-planned routes: draft posts stay out of every team-facing
path, publishing keeps the route contiguous, and the planning columns never
reach a team.
"""

from datetime import datetime

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import EventType
from app.models.checkpoint_arrival import CheckpointArrival
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import as_team, make_event, make_team, set_rally_settings

ROUTE_URL = "/api/rally/v1/checkpoint/admin/route"


async def _make_checkpoint(pg_session, order, *, is_draft=False, **overrides):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=overrides.pop("name", f"Checkpoint {order}"),
            order=order,
            latitude=overrides.pop("latitude", 41.0),
            longitude=overrides.pop("longitude", -8.0),
            is_draft=is_draft,
            **overrides,
        ),
        commit=True,
    )


class TestDraftVisibility:
    async def test_draft_is_absent_from_the_team_route(self, pg_session, pg_client):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session, show_route_mode="complete", reveal_next_checkpoint=True
        )
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, is_draft=True, name="Bar 1")
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert [cp["name"] for cp in response.json()] == ["Checkpoint 1"]

    async def test_draft_is_not_counted(self, pg_session, pg_client):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, is_draft=True)
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.get("/api/rally/v1/checkpoint/count")

        assert response.json() == 1

    async def test_draft_is_never_handed_out_as_the_next_post(self, pg_session, pg_client):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, is_draft=True, name="Bar 1")
        team = await make_team(pg_session, event_id=event.id)
        team.times = [datetime(2026, 8, 9, 10, 0)]  # already through post 1
        pg_session.add(team)
        await pg_session.commit()

        with as_team(team.id):
            response = pg_client.get("/api/rally/v1/checkpoint/me")

        # Post 2 exists but is still being planned: the route ends here rather
        # than sending the team to a stop that is not ready.
        assert response.status_code == 404

    async def test_planning_columns_are_not_serialized_for_a_team(self, pg_session, pg_client):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _make_checkpoint(
            pg_session,
            order=1,
            staff_script="Falar de desportos",
            challenge_brief="Girar 5x e acertar na baliza",
        )
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.get("/api/rally/v1/checkpoint/")

        payload = response.json()[0]
        assert "staff_script" not in payload
        assert "challenge_brief" not in payload


class TestRouteStatus:
    async def test_lists_drafts_and_what_each_post_still_lacks(
        self, pg_session, pg_client, as_admin
    ):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, gps_checkin_enabled=True, reveal_next_checkpoint=False)
        await _make_checkpoint(pg_session, order=1, clue="Segue o cheiro da comida")
        await _make_checkpoint(
            pg_session,
            order=2,
            is_draft=True,
            name="Bar 1",
            latitude=None,
            longitude=None,
        )

        response = pg_client.get(ROUTE_URL)

        assert response.status_code == 200
        body = response.json()
        assert body["published_count"] == 1
        assert body["draft_count"] == 1
        draft = body["checkpoints"][1]
        assert draft["is_draft"] is True
        assert set(draft["missing"]) >= {"clue", "coordinates", "activity", "staff"}

    async def test_a_published_post_with_gaps_is_flagged(self, pg_session, pg_client, as_admin):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, reveal_next_checkpoint=False)
        published = await _make_checkpoint(pg_session, order=1, clue=None)

        response = pg_client.get(ROUTE_URL)

        assert response.json()["incomplete_published_ids"] == [published.id]

    async def test_planning_columns_round_trip_for_an_admin(self, pg_session, pg_client, as_admin):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        checkpoint = await _make_checkpoint(pg_session, order=1)

        update = pg_client.put(
            f"/api/rally/v1/checkpoint/{checkpoint.id}",
            json={
                "staff_script": "Relembrar as cantinas",
                "challenge_brief": "Perguntas dois a dois",
            },
        )

        assert update.status_code == 200
        assert update.json()["staff_script"] == "Relembrar as cantinas"
        listed = pg_client.get(ROUTE_URL).json()["checkpoints"][0]
        assert listed["challenge_brief"] == "Perguntas dois a dois"


class TestPublishing:
    async def test_publishing_a_draft_closes_the_gap_in_the_route(
        self, pg_session, pg_client, as_admin
    ):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _make_checkpoint(pg_session, order=1)
        draft = await _make_checkpoint(pg_session, order=2, is_draft=True)
        await _make_checkpoint(pg_session, order=3)

        # The draft sits between two published posts; publishing it must leave
        # the published orders contiguous from 1, since progress is positional.
        response = pg_client.put(f"/api/rally/v1/checkpoint/{draft.id}", json={"is_draft": False})

        assert response.status_code == 200
        published = await crud_checkpoint.get_all_ordered(pg_session)
        assert [cp.order for cp in published] == [1, 2, 3]

    async def test_drafting_a_post_moves_it_after_the_published_ones(
        self, pg_session, pg_client, as_admin
    ):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        first = await _make_checkpoint(pg_session, order=1)
        second = await _make_checkpoint(pg_session, order=2)
        await _make_checkpoint(pg_session, order=3)

        pg_client.put(f"/api/rally/v1/checkpoint/{second.id}", json={"is_draft": True})

        published = await crud_checkpoint.get_all_ordered(pg_session)
        assert [cp.order for cp in published] == [1, 2]
        assert published[0].id == first.id
        await pg_session.refresh(second)
        assert second.order == 3

    async def test_a_previous_edition_s_arrivals_do_not_freeze_the_next_route(
        self, pg_session, pg_client, as_admin
    ):
        """Planning next year's route must not be blocked by last year's rally.

        The freeze exists because publishing renumbers the route under teams
        that are already walking it. That is a statement about the *current*
        edition — but the check used to ask "does any arrival exist at all",
        which is true forever once a single event has run. From the second
        edition onwards nobody could publish a draft post again.
        """
        # Last year's rally, with a team that walked it. Created first so that
        # crud_checkpoint.create files its post under it — new posts always go
        # to whichever edition is current at the time.
        old_event = await make_event(pg_session, name="Last year")
        finished_post = await _make_checkpoint(pg_session, order=1, name="Last year's post")
        old_team = await make_team(pg_session, name="Last year's team", event_id=old_event.id)
        pg_session.add(CheckpointArrival(team_id=old_team.id, checkpoint_id=finished_post.id))
        await pg_session.commit()

        # This year's edition takes over, and its own teams have started nothing.
        event = await make_event(
            pg_session, name="This year", event_type=EventType.PEDDY_PAPER.value
        )
        old_event.is_current = False
        await pg_session.commit()
        draft = await _make_checkpoint(pg_session, order=1, name="Undecided venue", is_draft=True)

        response = pg_client.put(f"/api/rally/v1/checkpoint/{draft.id}", json={"is_draft": False})

        assert response.status_code == 200
        await pg_session.refresh(draft)
        assert draft.is_draft is False
        assert event.id != old_event.id

    async def test_draft_state_is_frozen_once_a_team_has_checked_in(
        self, pg_session, pg_client, as_admin
    ):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        first = await _make_checkpoint(pg_session, order=1)
        draft = await _make_checkpoint(pg_session, order=2, is_draft=True)
        team = await make_team(pg_session, event_id=event.id)
        pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=first.id))
        await pg_session.commit()

        response = pg_client.put(f"/api/rally/v1/checkpoint/{draft.id}", json={"is_draft": False})

        assert response.status_code == 400
        await pg_session.refresh(draft)
        assert draft.is_draft is True
