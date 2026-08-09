"""Tests for half-planned routes: draft posts stay out of every team-facing
path, publishing keeps the route contiguous, the planning columns never reach
a team, and a pasted route table becomes drafts.
"""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import EventType
from app.models.checkpoint_arrival import CheckpointArrival
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import as_team, make_event, make_team, set_rally_settings

ROUTE_URL = "/api/rally/v1/checkpoint/admin/route"
IMPORT_URL = "/api/rally/v1/checkpoint/import"


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
        await set_rally_settings(pg_session, show_route_mode="complete")
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
        team.times = [10.0]  # already through post 1
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
        await set_rally_settings(
            pg_session, gps_checkin_enabled=True, reveal_next_checkpoint=False
        )
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
        response = pg_client.put(
            f"/api/rally/v1/checkpoint/{draft.id}", json={"is_draft": False}
        )

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

    async def test_draft_state_is_frozen_once_a_team_has_checked_in(
        self, pg_session, pg_client, as_admin
    ):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        first = await _make_checkpoint(pg_session, order=1)
        draft = await _make_checkpoint(pg_session, order=2, is_draft=True)
        team = await make_team(pg_session, event_id=event.id)
        pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=first.id))
        await pg_session.commit()

        response = pg_client.put(
            f"/api/rally/v1/checkpoint/{draft.id}", json={"is_draft": False}
        )

        assert response.status_code == 400
        await pg_session.refresh(draft)
        assert draft.is_draft is True


class TestRouteImport:
    PASTE = (
        "Posto\tAssunto\tPista\tDesafio\n"
        "Aristides\tFalar de desportos\tA pista seria uma bola\tGirar 5x\n"
        "Refúgio dos Drinks\tCF DECIDE\tEstás a precisar de energia?\tCF DECIDE\n"
        "Bar 1"
    )

    async def test_dry_run_previews_without_writing(self, pg_session, pg_client, as_admin):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)

        response = pg_client.post(IMPORT_URL, json={"text": self.PASTE, "dry_run": True})

        assert response.status_code == 200
        body = response.json()
        assert body["created"] == 0
        assert [row["name"] for row in body["rows"]] == [
            "Aristides",
            "Refúgio dos Drinks",
            "Bar 1",
        ]
        assert await crud_checkpoint.count(pg_session, include_drafts=True) == 0

    async def test_import_creates_drafts_appended_after_the_existing_route(
        self, pg_session, pg_client, as_admin
    ):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.post(IMPORT_URL, json={"text": self.PASTE})

        assert response.json()["created"] == 3
        everything = await crud_checkpoint.get_all_ordered(pg_session, include_drafts=True)
        assert [cp.order for cp in everything] == [1, 2, 3, 4]
        imported = everything[1]
        assert imported.is_draft is True
        assert imported.staff_script == "Falar de desportos"
        assert imported.clue == "A pista seria uma bola"
        assert imported.challenge_brief == "Girar 5x"
        # "CF DECIDE" is an empty cell, not content.
        assert everything[2].staff_script is None
        assert everything[3].is_placeholder is True

    async def test_imported_route_stays_invisible_to_teams(self, pg_session, pg_client, as_admin):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        pg_client.post(IMPORT_URL, json={"text": self.PASTE})
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.json() == []
