"""API + integration tests for route stages: CRUD, resequencing, and the
stage-aware progression rule actually gating GPS arrival.
"""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import EventType
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import as_team, make_event, make_team, set_rally_settings

STAGES_URL = "/api/rally/v1/route-stages"


async def _make_checkpoint(pg_session, order, **overrides):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=overrides.pop("name", f"Checkpoint {order}"),
            order=order,
            latitude=overrides.pop("latitude", 41.0),
            longitude=overrides.pop("longitude", -8.0),
            **overrides,
        ),
        commit=True,
    )


async def _stage(pg_client, *, name, order, order_matters=True, required_count=None):
    response = pg_client.post(
        STAGES_URL,
        json={
            "name": name,
            "order": order,
            "order_matters": order_matters,
            "required_count": required_count,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _assign(pg_client, checkpoint_id, stage_id):
    response = pg_client.put(
        f"/api/rally/v1/checkpoint/{checkpoint_id}", json={"stage_id": stage_id}
    )
    assert response.status_code == 200, response.text
    return response.json()


class TestRouteStageCRUD:
    async def test_create_and_list(self, pg_session, pg_client, as_admin):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)

        created = await _stage(pg_client, name="Universidade", order=1)

        response = pg_client.get(STAGES_URL)
        assert response.status_code == 200
        assert [s["id"] for s in response.json()] == [created["id"]]

    async def test_clashing_order_is_rejected(self, pg_session, pg_client, as_admin):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await _stage(pg_client, name="Universidade", order=1)

        response = pg_client.post(
            STAGES_URL,
            json={"name": "Bares", "order": 1, "order_matters": False, "required_count": None},
        )

        assert response.status_code == 400

    async def test_deleting_a_stage_unstages_its_posts_without_deleting_them(
        self, pg_session, pg_client, as_admin
    ):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        stage = await _stage(pg_client, name="Universidade", order=1)
        cp = await _make_checkpoint(pg_session, order=1)
        _assign(pg_client, cp.id, stage["id"])

        response = pg_client.delete(f"{STAGES_URL}/{stage['id']}")

        assert response.status_code == 200
        await pg_session.refresh(cp)
        assert cp.stage_id is None

    async def test_requires_admin(self, pg_session, pg_client, as_user):
        await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)

        response = pg_client.post(
            STAGES_URL,
            json={
                "name": "Universidade",
                "order": 1,
                "order_matters": True,
                "required_count": None,
            },
        )

        assert response.status_code == 403


class TestStageAwareArrival:
    """The rule actually gating auto-advance on arrival, not just the pure
    predicate.

    A GPS arrival is a fact ("the team stood here") and is recorded
    regardless of order — the app has always allowed that. What the stage
    rule gates is *advancement*: whether that arrival also moves the team
    past the post (``auto_complete_if_no_activities``, called for these
    no-activity posts). The endpoint reports 200 either way; the read that
    matters is the team's own progress.
    """

    async def test_ordered_stage_still_requires_sequence(self, pg_session, pg_client, as_admin):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, gps_checkin_enabled=True, route_stages_enabled=True)
        stage = await _stage(pg_client, name="Universidade", order=1)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2, latitude=42.0, longitude=-9.0)
        _assign(pg_client, cp1.id, stage["id"])
        _assign(pg_client, cp2.id, stage["id"])
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp2.id}/arrive",
                json={"latitude": 42.0, "longitude": -9.0},
            )

        # The arrival itself is accepted (it's a fact); it just does not
        # advance the team, since post 1 of the same ordered stage is unresolved.
        assert response.status_code == 200, response.text
        await pg_session.refresh(team)
        assert team.times == []

    async def test_free_stage_lets_teams_pick_any_unresolved_post(
        self, pg_session, pg_client, as_admin
    ):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, gps_checkin_enabled=True, route_stages_enabled=True)
        uni = await _stage(pg_client, name="Universidade", order=1, required_count=0)
        bars = await _stage(pg_client, name="Bares", order=2, order_matters=False)
        cp1 = await _make_checkpoint(pg_session, order=1, latitude=41.0, longitude=-8.0)
        cp2 = await _make_checkpoint(pg_session, order=2, latitude=42.0, longitude=-9.0)
        _assign(pg_client, cp1.id, uni["id"])
        _assign(pg_client, cp2.id, bars["id"])
        team = await make_team(pg_session, event_id=event.id)

        # The university stage is optional (required_count=0), so the second
        # post — in the free-choice bars stage — is reachable straight away.
        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp2.id}/arrive",
                json={"latitude": 42.0, "longitude": -9.0},
            )

        assert response.status_code == 200, response.text
        await pg_session.refresh(team)
        # Advances: cp2's order (2) records against a team that skipped cp1
        # entirely, since the university stage required none of its posts.
        assert len(team.times) == 1

    async def test_a_post_outside_any_stage_falls_back_to_the_plain_rule(
        self, pg_session, pg_client, as_admin
    ):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session,
            gps_checkin_enabled=True,
            route_stages_enabled=True,
            checkpoint_order_matters=True,
        )
        await _stage(pg_client, name="Universidade", order=1)
        cp1 = await _make_checkpoint(pg_session, order=1, latitude=41.0, longitude=-8.0)
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp1.id}/arrive",
                json={"latitude": 41.0, "longitude": -8.0},
            )

        assert response.status_code == 200, response.text


class TestCheckpointHours:
    async def test_arrival_before_opening_is_rejected_with_the_opening_time(
        self, pg_session, pg_client, as_admin
    ):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session, gps_checkin_enabled=True, checkpoint_hours_enabled=True
        )
        cp = await _make_checkpoint(pg_session, order=1)
        pg_client.put(
            f"/api/rally/v1/checkpoint/{cp.id}",
            json={"available_from": "2099-01-01T22:00:00Z"},
        )
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp.id}/arrive",
                json={"latitude": 41.0, "longitude": -8.0},
            )

        assert response.status_code == 400
        assert "not open" in response.json()["detail"].lower()

    async def test_disabling_hours_lets_the_arrival_through(self, pg_session, pg_client, as_admin):
        event = await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session, gps_checkin_enabled=True, checkpoint_hours_enabled=False
        )
        cp = await _make_checkpoint(pg_session, order=1)
        pg_client.put(
            f"/api/rally/v1/checkpoint/{cp.id}",
            json={"available_from": "2099-01-01T22:00:00Z"},
        )
        team = await make_team(pg_session, event_id=event.id)

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp.id}/arrive",
                json={"latitude": 41.0, "longitude": -8.0},
            )

        assert response.status_code == 200, response.text
