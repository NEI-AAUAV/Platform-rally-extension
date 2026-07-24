"""Unit tests for the Authentik management API client.

Uses httpx.MockTransport so no network is involved.
"""
from unittest.mock import patch

import httpx
import pytest

from app.api import authentik_client
from app.core.config import settings

pytestmark = pytest.mark.asyncio


def _configured(monkeypatch):
    monkeypatch.setattr(settings, "AUTHENTIK_API_URL", "https://auth.example/api/v3")
    monkeypatch.setattr(settings, "AUTHENTIK_API_TOKEN", "tok")


def _client_factory(handler):
    """Return an AsyncClient class whose instances use MockTransport."""
    transport = httpx.MockTransport(handler)

    class _PatchedClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs.pop("transport", None)
            super().__init__(*args, transport=transport, **kwargs)

    return _PatchedClient


async def test_search_returns_empty_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "AUTHENTIK_API_URL", "")
    monkeypatch.setattr(settings, "AUTHENTIK_API_TOKEN", "")
    assert await authentik_client.search_users("ana") == []


async def test_search_parses_users_and_sends_bearer_token(monkeypatch):
    _configured(monkeypatch)
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        seen["url"] = str(request.url)
        return httpx.Response(
            200,
            json={
                "results": [
                    {"uuid": "u-1", "name": "Ana", "username": "ana", "email": "a@ua.pt"},
                    {"uuid": None, "name": "SemUuid", "username": "x"},  # skipped
                    {"uuid": "u-2", "name": "", "username": "bruno", "email": None},
                ]
            },
        )

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        users = await authentik_client.search_users("an")

    assert seen["auth"] == "Bearer tok"
    assert "search=an" in seen["url"]
    assert [u.authentik_sub for u in users] == ["u-1", "u-2"]
    assert users[1].name == "bruno"  # falls back to username
    assert users[0].email == "a@ua.pt"


async def test_search_degrades_to_empty_on_http_error(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        assert await authentik_client.search_users("ana") == []


async def test_search_degrades_to_empty_on_invalid_json(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json")

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        assert await authentik_client.search_users("ana") == []


async def test_list_group_members_filters_by_group(monkeypatch):
    _configured(monkeypatch)
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(
            200,
            json={"results": [{"uuid": "g-1", "name": "Guia", "username": "guia"}]},
        )

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        members = await authentik_client.list_group_members("rally-guide")

    assert "groups_by_name=rally-guide" in seen["url"]
    assert members[0].authentik_sub == "g-1"


async def test_list_group_members_empty_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "AUTHENTIK_API_URL", "")
    monkeypatch.setattr(settings, "AUTHENTIK_API_TOKEN", "")
    assert await authentik_client.list_group_members("rally-guide") == []


async def test_list_group_members_skips_entries_without_uuid(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "results": [
                    {"uuid": None, "name": "NoUuid", "username": "nouuid"},
                    {"uuid": "g-2", "name": "", "username": "carla", "email": None},
                ]
            },
        )

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        members = await authentik_client.list_group_members("rally-guide")

    assert [m.authentik_sub for m in members] == ["g-2"]
    assert members[0].name == "carla"  # falls back to username
    assert members[0].email is None


async def test_list_group_members_degrades_to_empty_on_http_error(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        assert await authentik_client.list_group_members("rally-guide") == []
