"""API tests for the rally settings endpoints (view/update/branding uploads),
against real Postgres. R2 upload I/O (`validate_and_store`) stays mocked.
"""

import io
from unittest.mock import AsyncMock, patch

from app.tests.conftest import make_event as _make_event


def _png_upload(field: str = "image") -> dict:
    return {field: ("logo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


def _valid_settings_payload(**overrides) -> dict:
    payload = {
        "max_teams": 20,
        "max_members_per_team": 6,
        "enable_versus": False,
        "penalty_per_puke": -10,
        "penalty_per_not_drinking": -5,
        "bonus_per_extra_shot": 5,
        "max_extra_shots_per_member": 3,
        "checkpoint_order_matters": True,
        "enable_staff_scoring": True,
        "show_live_leaderboard": True,
        "show_team_details": True,
        "show_checkpoint_map": True,
        "participant_view_enabled": True,
        "show_route_mode": "focused",
        "show_score_mode": "hidden",
        "rally_theme": "default",
        "public_access_enabled": True,
    }
    payload.update(overrides)
    return payload


class TestViewRallySettings:
    async def test_view_as_participant(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/rally/settings")

        assert resp.status_code == 200, resp.text
        assert "event_type" in resp.json()

    async def test_view_public_no_auth_required(self, pg_session, pg_client):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/rally/settings/public")

        assert resp.status_code == 200, resp.text
        assert "event_type" in resp.json()


class TestUpdateRallySettings:
    async def test_admin_can_update_settings(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.put(
            "/api/rally/v1/rally/settings",
            json=_valid_settings_payload(bonus_per_extra_shot=7),
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["bonus_per_extra_shot"] == 7

    async def test_non_admin_cannot_update_settings(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        resp = pg_client.put(
            "/api/rally/v1/rally/settings",
            json=_valid_settings_payload(),
        )

        assert resp.status_code == 403


class TestBrandingUploads:
    async def test_admin_can_upload_banner(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with (
            patch(
                "app.api.api_v1.rally_settings.validate_and_store",
                new=AsyncMock(return_value="https://r2/banner.png"),
            ),
            patch("app.api.api_v1.rally_settings.storage_client.delete_image"),
        ):
            resp = pg_client.put("/api/rally/v1/rally/settings/banner", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["banner_url"] == "https://r2/banner.png"

    async def test_admin_can_upload_logo(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with (
            patch(
                "app.api.api_v1.rally_settings.validate_and_store",
                new=AsyncMock(return_value="https://r2/logo.png"),
            ),
            patch("app.api.api_v1.rally_settings.storage_client.delete_image"),
        ):
            resp = pg_client.put("/api/rally/v1/rally/settings/logo", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["logo_url"] == "https://r2/logo.png"

    async def test_admin_can_upload_favicon(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with (
            patch(
                "app.api.api_v1.rally_settings.validate_and_store",
                new=AsyncMock(return_value="https://r2/favicon.ico"),
            ),
            patch("app.api.api_v1.rally_settings.storage_client.delete_image"),
        ):
            resp = pg_client.put("/api/rally/v1/rally/settings/favicon", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["favicon_url"] == "https://r2/favicon.ico"

    async def test_non_admin_cannot_upload_banner(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        resp = pg_client.put("/api/rally/v1/rally/settings/banner", files=_png_upload())

        assert resp.status_code == 403

    async def test_upload_replaces_previous_image(self, pg_session, pg_client, as_admin):
        """A second upload must delete the previously-stored R2 image before
        persisting the new URL (exercises the `storage_client.delete_image`
        call against the existing `banner_url`, not an empty string)."""
        await _make_event(pg_session)

        with (
            patch(
                "app.api.api_v1.rally_settings.validate_and_store",
                new=AsyncMock(return_value="https://r2/banner-1.png"),
            ),
            patch("app.api.api_v1.rally_settings.storage_client.delete_image"),
        ):
            pg_client.put("/api/rally/v1/rally/settings/banner", files=_png_upload())

        with (
            patch(
                "app.api.api_v1.rally_settings.validate_and_store",
                new=AsyncMock(return_value="https://r2/banner-2.png"),
            ),
            patch("app.api.api_v1.rally_settings.storage_client.delete_image") as delete_mock_2,
        ):
            resp = pg_client.put("/api/rally/v1/rally/settings/banner", files=_png_upload())

        assert resp.status_code == 200, resp.text
        delete_mock_2.assert_called_once_with("https://r2/banner-1.png")
