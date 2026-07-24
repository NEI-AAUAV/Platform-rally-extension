
"""Tests for badge catalogue admin endpoints (A3), against real Postgres."""
from app.crud.crud_badge_definition import badge_definition as crud_def
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.schemas.badge_definition import BadgeDefinitionCreate, BadgeDefinitionUpdate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _disable_badges(pg_session):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, badges_enabled=False)
    )


async def _make_definition(pg_session, code="test_badge", active=True):
    defn = await crud_def.create(
        pg_session, obj_in=BadgeDefinitionCreate(code=code, name="Test Badge", is_active=active)
    )
    if not active:
        defn = await crud_def.update(
            pg_session, db_obj=defn, obj_in=BadgeDefinitionUpdate(is_active=False)
        )
    return defn


async def _make_team(pg_session):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))


class TestKillSwitch:
    async def test_write_endpoints_blocked_when_badges_disabled(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _disable_badges(pg_session)

        assert pg_client.post(
            "/api/rally/v1/badge-definitions", json={"code": "x", "name": "X"}
        ).status_code == 403
        assert pg_client.put(
            "/api/rally/v1/badge-definitions/1", json={"name": "X"}
        ).status_code == 403
        assert pg_client.delete("/api/rally/v1/badge-definitions/1").status_code == 403
        assert pg_client.post(
            "/api/rally/v1/badges/award", json={"team_id": 1, "badge_code": "x"}
        ).status_code == 403
        assert pg_client.delete("/api/rally/v1/badges/5").status_code == 403

    async def test_list_reachable_when_badges_disabled(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)
        await _disable_badges(pg_session)

        resp = pg_client.get("/api/rally/v1/badge-definitions")

        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestList:
    async def test_list_badge_definitions(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)

        resp = pg_client.get("/api/rally/v1/badge-definitions")

        assert resp.status_code == 200
        assert resp.json()[0]["code"] == "test_badge"


class TestCreate:
    async def test_create_badge_definition(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "new_badge", "name": "New Badge"},
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["code"] == "new_badge"

    async def test_create_badge_definition_with_full_fields(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions",
            json={
                "code": "fast_badge",
                "name": "Fast",
                "color": "#123456",
                "glyph": "⚡",
                "is_auto": True,
                "trigger_type": "first_complete_activity",
                "criteria": {"activity_id": 7},
            },
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["color"] == "#123456"
        assert body["trigger_type"] == "first_complete_activity"
        assert body["criteria"] == {"activity_id": 7}

    async def test_create_badge_definition_rejects_bad_trigger(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "x", "name": "X", "trigger_type": "not_a_trigger"},
        )

        assert resp.status_code == 422

    async def test_create_badge_definition_rejects_bad_code(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "Bad Code!", "name": "X"},
        )

        assert resp.status_code == 422

    async def test_create_badge_definition_duplicate(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session, code="test_badge")

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "test_badge", "name": "Dup"},
        )

        assert resp.status_code == 409


class TestUpdate:
    async def test_update_badge_definition(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        defn = await _make_definition(pg_session)

        resp = pg_client.put(f"/api/rally/v1/badge-definitions/{defn.id}", json={"name": "Updated"})

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Updated"

    async def test_update_badge_definition_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put("/api/rally/v1/badge-definitions/999999", json={"name": "X"})

        assert resp.status_code == 404


class TestUploadIcon:
    async def test_upload_icon_success(self, pg_session, pg_client, as_admin, monkeypatch):
        import io
        from unittest.mock import AsyncMock

        monkeypatch.setattr(
            "app.api.api_v1.badge_admin.validate_and_store",
            AsyncMock(return_value="https://r2/badge-icon.png"),
        )
        await _make_event(pg_session)
        defn = await _make_definition(pg_session)

        resp = pg_client.post(
            f"/api/rally/v1/badge-definitions/{defn.id}/icon",
            files={"image": ("icon.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 8), "image/png")},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["icon_url"] == "https://r2/badge-icon.png"

    async def test_upload_icon_not_found(self, pg_session, pg_client, as_admin):
        import io

        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badge-definitions/999999/icon",
            files={"image": ("icon.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 8), "image/png")},
        )

        assert resp.status_code == 404


class TestDelete:
    async def test_delete_badge_definition(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        defn = await _make_definition(pg_session)

        resp = pg_client.delete(f"/api/rally/v1/badge-definitions/{defn.id}")

        assert resp.status_code == 204

    async def test_delete_badge_definition_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete("/api/rally/v1/badge-definitions/999999")

        assert resp.status_code == 404


class TestManualAwardRevoke:
    async def test_manual_award_badge(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badges/award",
            json={"team_id": team.id, "badge_code": "test_badge"},
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["team_id"] == team.id
        assert resp.json()["badge_type"] == "test_badge"

    async def test_manual_award_badge_missing_team_is_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badges/award", json={"team_id": 999999, "badge_code": "test_badge"}
        )

        assert resp.status_code == 404

    async def test_manual_award_badge_duplicate_is_conflict(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)
        team = await _make_team(pg_session)

        first = pg_client.post(
            "/api/rally/v1/badges/award", json={"team_id": team.id, "badge_code": "test_badge"}
        )
        assert first.status_code == 201

        second = pg_client.post(
            "/api/rally/v1/badges/award", json={"team_id": team.id, "badge_code": "test_badge"}
        )
        assert second.status_code == 409

    async def test_manual_award_badge_inactive(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session, code="test_badge", active=False)
        team = await _make_team(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/badges/award",
            json={"team_id": team.id, "badge_code": "test_badge"},
        )

        assert resp.status_code == 400

    async def test_revoke_badge(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _make_definition(pg_session)
        team = await _make_team(pg_session)
        award = pg_client.post(
            "/api/rally/v1/badges/award", json={"team_id": team.id, "badge_code": "test_badge"}
        )
        badge_id = award.json()["id"]

        resp = pg_client.delete(f"/api/rally/v1/badges/{badge_id}")

        assert resp.status_code == 204

    async def test_revoke_badge_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete("/api/rally/v1/badges/999999")

        assert resp.status_code == 404

    # Note: the `IntegrityError` -> 409 fallback in `manual_award_badge`
    # (racing concurrent awards both passing the pre-check, then colliding on
    # `uq_team_badge_scope`) was attempted here via a ThreadPoolExecutor, but
    # proved flaky/unreliable to trigger deterministically through
    # TestClient's connection setup (both requests often fully serialize
    # through the pre-check before either commits) — dropped rather than kept
    # as a flaky test. The duplicate-detection behavior itself is still
    # covered by `test_manual_award_badge_duplicate_is_conflict` (via the
    # pre-check path).
