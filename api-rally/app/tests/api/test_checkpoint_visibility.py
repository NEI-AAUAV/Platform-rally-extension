"""Tests for checkpoint route-visibility rules (public/team/admin, focused/complete
mode), against real Postgres. Progress is driven through the real GPS arrival
endpoint rather than mocked, so `_compute_checkpoint_progress` runs for real.
"""
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.models.activity import EventType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import as_team
from app.tests.conftest import make_event


async def _make_event(pg_session):
    return await make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)


async def _make_checkpoint(pg_session, order, lat=41.0, lon=-8.0):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order, latitude=lat, longitude=lon),
    )


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    """RallySettingsUpdate requires every field (full-object PUT semantics);
    build it from the current row's values with the given overrides applied."""
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_show_route_mode(pg_session, mode: str):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, show_route_mode=mode)
    )


async def _make_team(pg_session):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))


def _arrive(pg_client, checkpoint, lat, lon):
    return pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
        json={"latitude": lat, "longitude": lon},
    )


class TestCheckpointVisibility:
    async def test_public_access_focused_mode(self, pg_session, pg_client):
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(
                settings, show_route_mode="focused", public_access_enabled=True, show_checkpoint_map=True
            ),
        )
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        await _make_checkpoint(pg_session, order=3, lat=43.0, lon=-10.0)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["order"] == 1

    async def test_public_access_complete_mode(self, pg_session, pg_client):
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(
                settings, show_route_mode="complete", public_access_enabled=True, show_checkpoint_map=True
            ),
        )
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        await _make_checkpoint(pg_session, order=3, lat=43.0, lon=-10.0)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert len(response.json()) == 3

    async def test_team_access_focused_mode_zero_progress(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_show_route_mode(pg_session, "focused")
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        team = await _make_team(pg_session)

        with as_team(team.id, "TeamA"):
            response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["order"] == 1

    async def test_team_access_focused_mode_some_progress(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_show_route_mode(pg_session, "focused")
        cp1 = await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        await _make_checkpoint(pg_session, order=3, lat=43.0, lon=-10.0)
        team = await _make_team(pg_session)

        with as_team(team.id, "TeamA"):
            arrive = _arrive(pg_client, cp1, 41.000045, -8.0)
            assert arrive.status_code == 200, arrive.text
            assert arrive.json()["auto_completed"] is True

            response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        data = response.json()
        assert [cp["order"] for cp in data] == [1, 2]

    async def test_admin_access_always_all(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _set_show_route_mode(pg_session, "focused")
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        await _make_checkpoint(pg_session, order=3, lat=43.0, lon=-10.0)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert len(response.json()) == 3

    async def test_logged_in_user_with_team_complete_mode_sees_all(
        self, pg_session, pg_client
    ):
        """A logged-in participant (not a team-token request) whose profile is
        linked to a team follows the same `_get_checkpoints_for_team` path as
        a team-token request (checkpoint.py lines 42/92-93)."""
        from app.api import deps
        from app.api.auth import api_nei_auth
        from app.main import app
        from app.schemas.user import DetailedUser
        from app.tests.conftest import _fake_auth_data

        await _make_event(pg_session)
        await _set_show_route_mode(pg_session, "complete")
        await _make_checkpoint(pg_session, order=1)
        await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0)
        team = await _make_team(pg_session)

        user = DetailedUser(id=99, name="Linked", disabled=False, team_id=team.id, scopes=[])
        auth_data = _fake_auth_data(scopes=[])
        app.dependency_overrides[api_nei_auth] = lambda: auth_data
        app.dependency_overrides[deps.get_current_user_optional] = lambda: user
        try:
            response = pg_client.get("/api/rally/v1/checkpoint/")
        finally:
            app.dependency_overrides.pop(api_nei_auth, None)
            app.dependency_overrides.pop(deps.get_current_user_optional, None)

        assert response.status_code == 200
        assert len(response.json()) == 2

    # NOTE: `_get_checkpoints_for_team`'s `if not team: return []` (line 46)
    # is unreachable through the API — `crud.team.get()` (CRUDBase.get) raises
    # NotFoundException itself for a missing id rather than returning None, so
    # a linked team_id that no longer resolves 404s before this branch runs.

    async def test_public_access_disabled_but_map_shown(self, pg_session, pg_client):
        """`public_access_enabled=False` with `show_checkpoint_map=True` still
        returns the full checkpoint list (checkpoint.py line 62)."""
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(
                settings, public_access_enabled=False, show_checkpoint_map=True
            ),
        )
        await _make_checkpoint(pg_session, order=1)

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert len(response.json()) == 1

    async def test_public_focused_mode_no_checkpoints_returns_empty(
        self, pg_session, pg_client
    ):
        """Focused public mode with zero checkpoints yields [] rather than
        indexing into an empty list (checkpoint.py line 67)."""
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        await rally_settings.update(
            pg_session,
            id=settings.id,
            obj_in=_settings_update(
                settings,
                show_route_mode="focused",
                public_access_enabled=True,
                show_checkpoint_map=True,
            ),
        )

        response = pg_client.get("/api/rally/v1/checkpoint/")

        assert response.status_code == 200
        assert response.json() == []
