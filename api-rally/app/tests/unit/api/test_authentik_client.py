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


async def test_list_group_members_follows_pagination(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        return httpx.Response(
            200,
            json={
                "results": [{"uuid": f"u-{page}", "name": "N", "username": "n"}],
                "pagination": {"next": 2 if page == 1 else 0},
            },
        )

    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)):
        members = await authentik_client.list_group_members("rally-staff")

    assert [m.authentik_sub for m in members] == ["u-1", "u-2"]


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


# ---------- account_has_subject: proof that an OIDC subject owns an account ----------

_ACCOUNT = {
    "pk": 42,
    "uuid": "3f2b8c1e-9d4a-4b7e-8f21-6c5d4e3a2b10",
    "uid": "a3c1f0e9d8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1",
    "username": "ana",
    "name": "Ana",
    "email": "ana@ua.pt",
}


def _account_handler(results):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params.get("uuid") == _ACCOUNT["uuid"]
        return httpx.Response(200, json={"results": results})

    return handler


def _mode(monkeypatch, mode):
    monkeypatch.setattr(settings, "OIDC_SUBJECT_MODE", mode)


@pytest.mark.parametrize(
    ("mode", "subject"),
    [
        ("hashed_user_id", _ACCOUNT["uid"]),
        ("user_uuid", _ACCOUNT["uuid"]),
        ("user_id", str(_ACCOUNT["pk"])),
    ],
)
async def test_account_has_subject_accepts_the_configured_mode_identifier(
    monkeypatch, mode, subject
):
    _configured(monkeypatch)
    _mode(monkeypatch, mode)
    with patch.object(
        authentik_client.httpx, "AsyncClient", _client_factory(_account_handler([_ACCOUNT]))
    ):
        assert await authentik_client.account_has_subject(_ACCOUNT["uuid"], subject) is True


@pytest.mark.parametrize(
    "subject",
    [_ACCOUNT["uuid"], str(_ACCOUNT["pk"]), _ACCOUNT["username"]],
    ids=["uuid", "pk", "username"],
)
async def test_account_has_subject_ignores_identifiers_of_other_modes(monkeypatch, subject):
    """In hashed-id mode a subject that equals the account's uuid, pk or
    username came from a different identifier space, e.g. an attacker whose
    username was set to the victim's uuid under another provider."""
    _configured(monkeypatch)
    _mode(monkeypatch, "hashed_user_id")
    with patch.object(
        authentik_client.httpx, "AsyncClient", _client_factory(_account_handler([_ACCOUNT]))
    ):
        assert await authentik_client.account_has_subject(_ACCOUNT["uuid"], subject) is False


@pytest.mark.parametrize("mode", ["user_username", "user_email", "user_upn", "bogus"])
async def test_account_has_subject_refuses_mutable_or_unknown_modes(monkeypatch, mode):
    """Usernames and emails can be changed by their owner, so they prove
    nothing; an unknown mode is treated the same way."""
    _configured(monkeypatch)
    _mode(monkeypatch, mode)
    with patch.object(
        authentik_client.httpx, "AsyncClient", _client_factory(_account_handler([_ACCOUNT]))
    ):
        for subject in (_ACCOUNT["username"], _ACCOUNT["email"], _ACCOUNT["uid"]):
            assert await authentik_client.account_has_subject(_ACCOUNT["uuid"], subject) is False


async def test_account_has_subject_never_matches_on_email(monkeypatch):
    """Authentik does not enforce unique emails, so an email-mode subject from a
    different account could equal this account's email."""
    _configured(monkeypatch)
    with patch.object(
        authentik_client.httpx, "AsyncClient", _client_factory(_account_handler([_ACCOUNT]))
    ):
        assert await authentik_client.account_has_subject(_ACCOUNT["uuid"], "ana@ua.pt") is False


async def test_account_has_subject_false_for_unknown_account(monkeypatch):
    _configured(monkeypatch)
    with patch.object(authentik_client.httpx, "AsyncClient", _client_factory(_account_handler([]))):
        assert (
            await authentik_client.account_has_subject(_ACCOUNT["uuid"], _ACCOUNT["uid"]) is False
        )


async def test_account_has_subject_false_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "AUTHENTIK_API_URL", "")
    monkeypatch.setattr(settings, "AUTHENTIK_API_TOKEN", "")
    assert await authentik_client.account_has_subject(_ACCOUNT["uuid"], _ACCOUNT["uid"]) is False


async def test_account_has_subject_raises_when_authentik_unreachable(monkeypatch):
    _configured(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="bad gateway")

    with (
        patch.object(authentik_client.httpx, "AsyncClient", _client_factory(handler)),
        pytest.raises(authentik_client.AuthentikUnavailableError),
    ):
        await authentik_client.account_has_subject(_ACCOUNT["uuid"], _ACCOUNT["uid"])
