"""Checkpoint API tests against a real Postgres schema (pg_client + as_admin/as_user)."""

import datetime as dt

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.activity import EventType
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import make_event as _make_event
from app.tests.conftest import set_rally_settings


async def _make_checkpoint(pg_session, order: int = 1):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order),
        commit=True,
    )


async def _make_checkpoint_with_location(pg_session, order: int, **overrides):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=overrides.pop("name", f"Checkpoint {order}"),
            order=order,
            latitude=overrides.pop("latitude", 40.0 + order),
            longitude=overrides.pop("longitude", -8.0 - order),
            clue=overrides.pop("clue", f"Clue {order}"),
            **overrides,
        ),
        commit=True,
    )


def _own_team(pg_client):
    return pg_client.get("/api/rally/v1/team/me")


def _next_checkpoint(pg_client):
    return pg_client.get("/api/rally/v1/checkpoint/me")


def _assert_progress_agreement(pg_client, *, expected_order: int | None) -> None:
    team_response = _own_team(pg_client)
    assert team_response.status_code == 200, team_response.text
    team_body = team_response.json()

    next_response = _next_checkpoint(pg_client)
    if expected_order is None:
        assert next_response.status_code == 404, next_response.text
    else:
        assert next_response.status_code == 200, next_response.text
        assert next_response.json()["order"] == expected_order

    assert team_body["current_checkpoint_number"] == expected_order


class TestCheckpointListing:
    async def test_get_checkpoints_as_admin_returns_all(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert [cp["order"] for cp in body] == [1, 2]

    async def test_get_checkpoints_empty(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert response.json() == []

    async def test_get_checkpoints_count(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.get("/api/rally/v1/checkpoint/count")

        assert response.status_code == 200
        assert response.json() == 1

    async def test_get_checkpoints_count_unauthenticated_public_disabled(
        self, pg_session, pg_client
    ):
        from app.crud.crud_rally_settings import rally_settings
        from app.schemas.rally_settings import (
            RallySettingsResponse,
            RallySettingsUpdate,
        )

        await _make_event(pg_session)
        # Explicitly force public_access_enabled off — don't rely on the
        # column default, since `get_or_create`'s event-bootstrap path may
        # already have materialized a settings row before this call.
        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["public_access_enabled"] = False
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )

        response = pg_client.get("/api/rally/v1/checkpoint/count")

        assert response.status_code == 401

    async def test_get_checkpoints_count_unauthenticated_public_enabled(
        self, pg_session, pg_client
    ):
        from app.crud.crud_rally_settings import rally_settings
        from app.schemas.rally_settings import (
            RallySettingsResponse,
            RallySettingsUpdate,
        )

        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["public_access_enabled"] = True
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.get("/api/rally/v1/checkpoint/count")

        assert response.status_code == 200
        assert response.json() == 1

    async def test_get_checkpoint_map_hidden_returns_403(self, pg_session, pg_client):
        from app.crud.crud_rally_settings import rally_settings
        from app.schemas.rally_settings import (
            RallySettingsResponse,
            RallySettingsUpdate,
        )

        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["public_access_enabled"] = False
        data["show_checkpoint_map"] = False
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 403


class TestNextCheckpoint:
    async def test_get_next_checkpoint_unauthenticated_401(self, pg_session, pg_client):
        await _make_event(pg_session)

        response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 401

    async def test_get_next_checkpoint_for_team_token(self, pg_session, pg_client):
        from app.crud.crud_team import team as crud_team
        from app.schemas.team import TeamCreate
        from app.tests.conftest import as_team

        await _make_event(pg_session)
        # /checkpoint/me is the participant view, which the endpoint now gates
        # on the manager's switch; a non-peddy event has it off by default.
        await set_rally_settings(pg_session, participant_view_enabled=True)
        await _make_checkpoint(pg_session, order=1)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="NextTeam"), commit=True)

        with as_team(team.id, "NextTeam"):
            response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 200, response.text
        assert response.json()["order"] == 1

    async def test_get_next_checkpoint_for_logged_in_user_with_team(
        self, pg_session, pg_client, as_user
    ):
        """A logged-in participant (not a team-token request) whose profile is
        linked to a team resolves team_id from curr_user (checkpoint.py line 142)."""
        from app.crud.crud_team import team as crud_team
        from app.schemas.team import TeamCreate

        await _make_event(pg_session)
        await set_rally_settings(pg_session, participant_view_enabled=True)
        await _make_checkpoint(pg_session, order=1)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="LinkedTeam"), commit=True)
        as_user.team_id = team.id

        response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 200, response.text
        assert response.json()["order"] == 1

    async def test_get_next_checkpoint_none_left_404(self, pg_session, pg_client):
        from app.crud.crud_team import team as crud_team
        from app.schemas.team import TeamCreate
        from app.tests.conftest import as_team

        await _make_event(pg_session)
        await set_rally_settings(pg_session, participant_view_enabled=True)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="DoneTeam"))
        # Team already checked into the only checkpoint -> no next one.

        team.times = [dt.datetime(2026, 1, 1)]
        pg_session.add(team)
        await pg_session.commit()

        with as_team(team.id, "DoneTeam"):
            response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 404

    async def test_next_checkpoint_after_no_activity_arrival_points_to_last_post(
        self, pg_session, pg_client
    ):
        """Regression: peddy-paper team finished post 1 (its only activity),
        physically arrived at the no-activity post 2, and post 3 is the last.
        The team must be pointed at post 3 — redacted — not told the rally is
        over with post 3's location revealed.
        """

        from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
        from app.crud.crud_activity import activity as crud_activity
        from app.crud.crud_rally_settings import rally_settings
        from app.crud.crud_team import team as crud_team
        from app.models.activity import ActivityResult
        from app.models.checkpoint_arrival import CheckpointArrival
        from app.schemas.activity import ActivityCreate, ActivityType
        from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
        from app.schemas.team import TeamCreate
        from app.tests.conftest import as_team

        await _make_event(pg_session)
        cp1 = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        cp2 = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP2", order=2), commit=True
        )
        await crud_checkpoint.create(
            pg_session,
            obj_in=CheckPointCreate(
                name="CP3", order=3, clue="Behind the fountain", latitude=40.6, longitude=-8.6
            ),
            commit=True,
        )
        activity1 = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act1",
                checkpoint_id=cp1.id,
                activity_type=ActivityType.GENERAL,
                config={},
                is_active=True,
            ),
        )
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="PeddyMe"), commit=True)
        await pg_session.commit()

        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["reveal_next_checkpoint"] = False
        # /checkpoint/me is gated on the participant-view switch.
        data["participant_view_enabled"] = True
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )

        # Post 1 resolved: its active activity has a scored result, and the
        # staff evaluation recorded the visit.
        pg_session.add(
            ActivityResult(
                activity_id=activity1.id, team_id=team.id, final_score=10, is_completed=True
            )
        )
        await pg_session.commit()
        # enforce_order=False, exactly as the staff-evaluation path calls it:
        # post 1 is already resolved by the scored result above, so the
        # reachability guard would (correctly) refuse a fresh check-in there.
        await checkin_team_to_checkpoint(pg_session, team.id, cp1.id, enforce_order=False)
        await pg_session.commit()

        # Physically arrived at the no-activity post 2.
        pg_session.add(
            CheckpointArrival(
                team_id=team.id, checkpoint_id=cp2.id, arrived_at=dt.datetime(2026, 1, 1)
            )
        )
        await pg_session.commit()

        with as_team(team.id, "PeddyMe"):
            response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["order"] == 3
        assert body["is_redacted"] is True
        assert body["clue"] == "Behind the fountain"
        assert body["latitude"] is None
        assert body["longitude"] is None

    async def test_next_checkpoint_privileged_bypasses_redaction(
        self, pg_session, pg_client, as_admin
    ):
        """Staff/admin get the next post unredacted even under
        ``reveal_next_checkpoint=False``."""
        from app.crud.crud_rally_settings import rally_settings
        from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate

        await _make_event(pg_session)
        await crud_checkpoint.create(
            pg_session,
            obj_in=CheckPointCreate(
                name="CP1", order=1, clue="secret", latitude=40.6, longitude=-8.6
            ),
            commit=True,
        )
        from app.crud.crud_team import team as crud_team
        from app.schemas.team import TeamCreate

        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="StaffTeam"), commit=True)
        as_admin.team_id = team.id

        settings = await rally_settings.get_or_create(pg_session)
        data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
        data["reveal_next_checkpoint"] = False
        await rally_settings.update(
            pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
        )

        response = pg_client.get("/api/rally/v1/checkpoint/me")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["order"] == 1
        assert body["latitude"] == 40.6
        assert body.get("is_redacted") in (False, None)


class TestCanonicalProgressAgreement:
    async def test_sequential_staff_scan_agrees_with_team_progress(
        self, pg_session, pg_client, as_user
    ):
        from app.tests.conftest import make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, participant_view_enabled=True)
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        from app.services.checkpoint_visits import record_visit

        assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is True

        _assert_progress_agreement(pg_client, expected_order=2)

    async def test_free_order_agrees_with_team_progress(self, pg_session, pg_client, as_user):
        from app.tests.conftest import make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session,
            participant_view_enabled=True,
            checkpoint_order_matters=False,
        )
        await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        _assert_progress_agreement(pg_client, expected_order=1)
        assert set(_own_team(pg_client).json()["open_checkpoint_orders"]) == {1, 2}

    async def test_route_stages_agree_with_team_progress(self, pg_session, pg_client, as_admin):
        from app.tests.conftest import make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session,
            participant_view_enabled=True,
            gps_checkin_enabled=True,
            route_stages_enabled=True,
        )
        stage1 = pg_client.post(
            "/api/rally/v1/route-stages",
            json={"name": "Stage 1", "order": 1, "order_matters": True, "required_count": 1},
        ).json()
        stage2 = pg_client.post(
            "/api/rally/v1/route-stages",
            json={"name": "Stage 2", "order": 2, "order_matters": False, "required_count": None},
        ).json()
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        cp2 = await _make_checkpoint_with_location(pg_session, 2)
        cp3 = await _make_checkpoint_with_location(pg_session, 3)
        pg_client.put(f"/api/rally/v1/checkpoint/{cp1.id}", json={"stage_id": stage1["id"]})
        pg_client.put(f"/api/rally/v1/checkpoint/{cp2.id}", json={"stage_id": stage2["id"]})
        pg_client.put(f"/api/rally/v1/checkpoint/{cp3.id}", json={"stage_id": stage2["id"]})
        team = await make_team(pg_session, event_id=event.id)
        as_admin.team_id = team.id

        from app.services.checkpoint_visits import record_visit

        assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is True
        _assert_progress_agreement(pg_client, expected_order=2)
        team_body = _own_team(pg_client).json()
        assert set(team_body["open_checkpoint_orders"]) == {2, 3}

    async def test_gps_arrival_agrees_with_team_progress(self, pg_session, pg_client, as_user):
        from app.tests.conftest import as_team, make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session,
            participant_view_enabled=True,
            gps_checkin_enabled=True,
            reveal_next_checkpoint=False,
        )
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp1.id}/arrive",
                json={"latitude": cp1.latitude, "longitude": cp1.longitude},
            )
        assert response.status_code == 200, response.text

        _assert_progress_agreement(pg_client, expected_order=2)

    async def test_guide_arrival_agrees_with_team_progress(self, pg_session, pg_client, as_admin):
        from app.tests.conftest import make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session,
            participant_view_enabled=True,
            # Every guide surface is gated on the guide-mode pair, not just on
            # the manual-arrival switch.
            guide_mode_enabled=True,
            guide_mode_active=True,
            guide_manual_arrival_enabled=True,
        )
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_admin.team_id = team.id

        response = pg_client.post(
            f"/api/rally/v1/guide/checkpoints/{cp1.id}/arrivals",
            json={"team_id": team.id},
        )
        assert response.status_code == 201, response.text

        _assert_progress_agreement(pg_client, expected_order=2)

    async def test_skip_agrees_with_team_progress(self, pg_session, pg_client, as_user):
        from app.tests.conftest import as_team, make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(pg_session, participant_view_enabled=True, skip_enabled=True)
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        with as_team(team.id):
            response = pg_client.post(f"/api/rally/v1/checkpoint/{cp1.id}/skip")
        assert response.status_code == 200, response.text

        _assert_progress_agreement(pg_client, expected_order=2)

    async def test_checkpoint_without_activity_agrees_on_arrival(
        self, pg_session, pg_client, as_user
    ):
        from app.tests.conftest import as_team, make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session, participant_view_enabled=True, gps_checkin_enabled=True
        )
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        with as_team(team.id):
            response = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp1.id}/arrive",
                json={"latitude": cp1.latitude, "longitude": cp1.longitude},
            )
        assert response.status_code == 200, response.text

        _assert_progress_agreement(pg_client, expected_order=2)

    async def test_checkpoint_with_activity_stays_current_until_scored_and_then_advances(
        self, pg_session, pg_client, as_user
    ):
        from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
        from app.crud.crud_activity import activity as crud_activity
        from app.models.activity import ActivityResult
        from app.schemas.activity import ActivityCreate, ActivityType
        from app.tests.conftest import as_team, make_team

        event = await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
        await set_rally_settings(
            pg_session, participant_view_enabled=True, gps_checkin_enabled=True
        )
        cp1 = await _make_checkpoint_with_location(pg_session, 1)
        await _make_checkpoint_with_location(pg_session, 2)
        activity = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Quiz",
                checkpoint_id=cp1.id,
                activity_type=ActivityType.GENERAL,
                config={},
                is_active=True,
            ),
        )
        team = await make_team(pg_session, event_id=event.id)
        as_user.team_id = team.id

        with as_team(team.id):
            arrival = pg_client.post(
                f"/api/rally/v1/checkpoint/{cp1.id}/arrive",
                json={"latitude": cp1.latitude, "longitude": cp1.longitude},
            )
        assert arrival.status_code == 200, arrival.text
        _assert_progress_agreement(pg_client, expected_order=1)

        pg_session.add(
            ActivityResult(
                activity_id=activity.id, team_id=team.id, final_score=10, is_completed=True
            )
        )
        await pg_session.commit()
        await checkin_team_to_checkpoint(pg_session, team.id, cp1.id, enforce_order=False)
        await pg_session.commit()

        _assert_progress_agreement(pg_client, expected_order=2)


class TestCheckpointTeamsEndpoint:
    # Note: the `is_admin(...) and select_in.checkpoint_id is None` branch
    # (unfiltered "all teams" listing) is unreachable through the API: an
    # admin who omits checkpoint_id is already rejected with 400 by
    # `validate_checkpoint_access` before this endpoint's body can check
    # `select_in.checkpoint_id is None` itself, so a checkpoint_id is always
    # required and resolved by the time this branch would run.

    async def test_get_checkpoint_teams_missing_id_admin_400(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.get("/api/rally/v1/checkpoint/teams")

        assert response.status_code == 400

    async def test_get_checkpoint_teams_by_checkpoint_id(self, pg_session, pg_client, as_admin):

        from app.crud.crud_team import team as crud_team
        from app.models.checkpoint_arrival import CheckpointArrival
        from app.schemas.team import TeamCreate

        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="T1"))
        # `get_by_checkpoint` matches on the arrival row, which names the post
        # (it used to compare the visit *count* to the post's order). The
        # timestamp on `times` is what `last_checkpoint_time` reports.
        team.times = [dt.datetime(2026, 1, 1)]
        pg_session.add(team)
        pg_session.add(
            CheckpointArrival(
                team_id=team.id, checkpoint_id=cp.id, arrived_at=dt.datetime(2026, 1, 1)
            )
        )
        await pg_session.commit()

        response = pg_client.get(f"/api/rally/v1/checkpoint/teams?checkpoint_id={cp.id}")

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert body[0]["id"] == team.id
        assert body[0]["last_checkpoint_time"] is not None


class TestReorderCheckpoints:
    async def test_reorder_checkpoints_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)

        response = pg_client.put(
            "/api/rally/v1/checkpoint/reorder",
            json={str(cp1.id): 2, str(cp2.id): 1},
        )

        assert response.status_code == 200, response.text
        assert response.json()["message"] == "Checkpoints reordered successfully"

    async def test_reorder_checkpoints_duplicate_order_rejected(
        self, pg_session, pg_client, as_admin
    ):
        """Reordering two checkpoints to the same final order violates the
        unique order constraint, which the endpoint wraps into a 400."""
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)
        cp2 = await _make_checkpoint(pg_session, order=2)

        response = pg_client.put(
            "/api/rally/v1/checkpoint/reorder",
            json={str(cp1.id): 5, str(cp2.id): 5},
        )

        assert response.status_code == 400
        assert "Cannot reorder checkpoints" in response.json()["detail"]

    async def test_reorder_checkpoints_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)
        cp1 = await _make_checkpoint(pg_session, order=1)

        response = pg_client.put("/api/rally/v1/checkpoint/reorder", json={str(cp1.id): 1})

        assert response.status_code == 403


class TestCheckpointCRUDApi:
    async def test_create_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={
                "name": "New Checkpoint",
                "description": "New checkpoint description",
                "latitude": 40.7589,
                "longitude": -73.9851,
                "order": 1,
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["name"] == "New Checkpoint"
        assert body["order"] == 1

    async def test_create_checkpoint_duplicate_order_rejected(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={"name": "Dup", "order": 1},
        )

        assert response.status_code == 400

    async def test_create_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        response = pg_client.post(
            "/api/rally/v1/checkpoint/",
            json={"name": "New Checkpoint", "order": 1},
        )

        assert response.status_code == 403

    async def test_update_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.put(
            f"/api/rally/v1/checkpoint/{cp.id}",
            json={"name": "Updated Checkpoint", "description": "Updated description"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["name"] == "Updated Checkpoint"

    async def test_update_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.put(f"/api/rally/v1/checkpoint/{cp.id}", json={"name": "Nope"})

        assert response.status_code == 403

    async def test_delete_checkpoint_as_admin(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.delete(f"/api/rally/v1/checkpoint/{cp.id}")

        assert response.status_code == 200
        assert (await crud_checkpoint.get_multi(pg_session)) == []

    async def test_delete_checkpoint_requires_admin(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)
        cp = await _make_checkpoint(pg_session, order=1)

        response = pg_client.delete(f"/api/rally/v1/checkpoint/{cp.id}")

        assert response.status_code == 403

    async def test_delete_checkpoint_not_found_rejected(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.delete("/api/rally/v1/checkpoint/999999")

        # crud.checkpoint.remove raises RallyNotFoundError for a missing id;
        # the endpoint's broad except wraps it into a 400 RallyValidationError.
        assert response.status_code == 400

    async def test_update_checkpoint_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        response = pg_client.put("/api/rally/v1/checkpoint/999999", json={"name": "Nope"})

        assert response.status_code == 404


class TestCheckpointBusinessLogic:
    """Pure validation logic — no DB, kept as-is."""

    def test_checkpoint_order_validation(self):
        checkpoints = [
            {"id": 1, "order": 1, "name": "First"},
            {"id": 2, "order": 2, "name": "Second"},
            {"id": 3, "order": 3, "name": "Third"},
        ]

        orders = [cp["order"] for cp in checkpoints]
        assert orders == sorted(orders)
        assert len(set(orders)) == len(orders)

    def test_checkpoint_coordinate_validation(self):
        valid_coordinates = [
            {"latitude": 40.7128, "longitude": -74.0060},
            {"latitude": 51.5074, "longitude": -0.1278},
            {"latitude": 35.6762, "longitude": 139.6503},
        ]

        for coord in valid_coordinates:
            assert -90 <= coord["latitude"] <= 90
            assert -180 <= coord["longitude"] <= 180
