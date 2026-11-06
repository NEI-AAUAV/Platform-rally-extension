"""API tests for the organising-núcleos logo strip (AAUAv slot + partner
logos), against real Postgres. R2 upload I/O stays mocked.
"""

import io
from unittest.mock import AsyncMock, patch

from app.tests.conftest import make_event as _make_event

BASE = "/api/rally/v1/rally/settings"
STORE = "app.services.rally_settings_service.validate_and_store"
DELETE = "app.services.rally_settings_service.storage_client.delete_image"


def _png_upload() -> dict:
    return {"image": ("logo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


def _add_partner(client, name: str, url: str):
    with patch(STORE, new=AsyncMock(return_value=url)):
        return client.post(f"{BASE}/partners", files=_png_upload(), data={"name": name})


class TestAauavLogo:
    async def test_admin_can_upload_aauav_logo(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with patch(STORE, new=AsyncMock(return_value="https://r2/aauav.png")), patch(DELETE):
            resp = pg_client.put(f"{BASE}/aauav-logo", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["aauav_logo_url"] == "https://r2/aauav.png"

    async def test_non_admin_cannot_upload_aauav_logo(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        resp = pg_client.put(f"{BASE}/aauav-logo", files=_png_upload())

        assert resp.status_code == 403


class TestPartnerLogos:
    async def test_defaults_are_empty_and_hidden(self, pg_session, pg_client):
        await _make_event(pg_session)

        body = pg_client.get(f"{BASE}/public").json()

        assert body["partner_logos"] == []
        assert body["show_partners"] is False
        assert body["aauav_logo_url"] == ""

    async def test_admin_adds_partners_in_order(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        _add_partner(pg_client, "NEEET", "https://r2/neeet.png")
        resp = _add_partner(pg_client, "NEMec", "https://r2/nemec.png")

        assert resp.status_code == 200, resp.text
        logos = resp.json()["partner_logos"]
        assert [logo["name"] for logo in logos] == ["NEEET", "NEMec"]
        assert all(logo["id"] for logo in logos)

    async def test_blank_name_rejected(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = _add_partner(pg_client, "   ", "https://r2/x.png")

        assert resp.status_code == 400

    async def test_non_admin_cannot_add_partner(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        resp = _add_partner(pg_client, "NEEET", "https://r2/neeet.png")

        assert resp.status_code == 403

    async def test_reorder_partners(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        _add_partner(pg_client, "A", "https://r2/a.png")
        logos = _add_partner(pg_client, "B", "https://r2/b.png").json()["partner_logos"]
        reversed_ids = [logo["id"] for logo in reversed(logos)]

        resp = pg_client.put(f"{BASE}/partners/order", json={"ids": reversed_ids})

        assert resp.status_code == 200, resp.text
        assert [logo["name"] for logo in resp.json()["partner_logos"]] == ["B", "A"]

    async def test_reorder_with_unknown_ids_rejected(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        _add_partner(pg_client, "A", "https://r2/a.png")

        resp = pg_client.put(f"{BASE}/partners/order", json={"ids": ["nope"]})

        assert resp.status_code == 400

    async def test_remove_partner_deletes_r2_object(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        logo = _add_partner(pg_client, "A", "https://r2/a.png").json()["partner_logos"][0]

        with patch(DELETE) as delete_image:
            resp = pg_client.delete(f"{BASE}/partners/{logo['id']}")

        assert resp.status_code == 200, resp.text
        assert resp.json()["partner_logos"] == []
        delete_image.assert_called_once_with("https://r2/a.png")

    async def test_remove_unknown_partner_404(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.delete(f"{BASE}/partners/missing")

        assert resp.status_code == 404

    async def test_show_partners_toggle_via_settings_put(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        current = pg_client.get(BASE).json()

        resp = pg_client.put(BASE, json={**current, "show_partners": True})

        assert resp.status_code == 200, resp.text
        assert resp.json()["show_partners"] is True


class TestDarkLogos:
    async def test_admin_uploads_aauav_dark_logo(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with patch(STORE, new=AsyncMock(return_value="https://r2/aauav-w.png")), patch(DELETE):
            resp = pg_client.put(f"{BASE}/aauav-logo-dark", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["aauav_logo_dark_url"] == "https://r2/aauav-w.png"

    async def test_partner_dark_upload_replaces_previous(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        logo = _add_partner(pg_client, "A", "https://r2/a.png").json()["partner_logos"][0]
        assert logo["dark_url"] == ""

        with patch(STORE, new=AsyncMock(return_value="https://r2/a-w1.png")), patch(DELETE):
            pg_client.put(f"{BASE}/partners/{logo['id']}/dark", files=_png_upload())
        with (
            patch(STORE, new=AsyncMock(return_value="https://r2/a-w2.png")),
            patch(DELETE) as delete_image,
        ):
            resp = pg_client.put(f"{BASE}/partners/{logo['id']}/dark", files=_png_upload())

        assert resp.status_code == 200, resp.text
        assert resp.json()["partner_logos"][0]["dark_url"] == "https://r2/a-w2.png"
        delete_image.assert_called_once_with("https://r2/a-w1.png")

    async def test_partner_dark_upload_unknown_id_404(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with patch(STORE, new=AsyncMock(return_value="https://r2/x.png")):
            resp = pg_client.put(f"{BASE}/partners/missing/dark", files=_png_upload())

        assert resp.status_code == 404

    async def test_non_admin_cannot_upload_partner_dark(self, pg_session, pg_client, as_user):
        await _make_event(pg_session)

        resp = pg_client.put(f"{BASE}/partners/any/dark", files=_png_upload())

        assert resp.status_code == 403

    async def test_removing_partner_deletes_both_versions(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        logo = _add_partner(pg_client, "A", "https://r2/a.png").json()["partner_logos"][0]
        with patch(STORE, new=AsyncMock(return_value="https://r2/a-w.png")), patch(DELETE):
            pg_client.put(f"{BASE}/partners/{logo['id']}/dark", files=_png_upload())

        with patch(DELETE) as delete_image:
            pg_client.delete(f"{BASE}/partners/{logo['id']}")

        deleted = {call.args[0] for call in delete_image.call_args_list}
        assert deleted == {"https://r2/a.png", "https://r2/a-w.png"}
