"""Thin async client for the Authentik management API.

Used so admins can search *all* Authentik accounts when linking a real account
to a name-only placeholder member — not only the accounts already mirrored
locally after a first OIDC login.

Authentik's default OIDC ``sub`` claim is the user's UUID, so we surface
``uuid`` as ``authentik_sub``. We also keep ``username``/``email`` so the link
can be reconciled if a deployment customised the ``sub`` mapping.
"""

from dataclasses import dataclass

import httpx
from loguru import logger

from app.core.config import settings

# Authentik default page size is fine; we cap results for the picker UI.
_SEARCH_LIMIT = 20
_TIMEOUT_SECONDS = 8.0
_GROUP_PAGE_SIZE = 100
_MAX_GROUP_PAGES = 50


@dataclass(frozen=True)
class AuthentikUser:
    """A subset of an Authentik user relevant to linking."""

    authentik_sub: str
    name: str
    username: str
    email: str | None


def is_configured() -> bool:
    """True when the Authentik management API is configured."""
    return bool(settings.AUTHENTIK_API_URL and settings.AUTHENTIK_API_TOKEN)


async def search_users(q: str, *, limit: int = _SEARCH_LIMIT) -> list[AuthentikUser]:
    """Search Authentik accounts by name, username or email.

    Returns an empty list when the API is not configured or on any transport
    error — the caller falls back to the locally-mirrored search.
    """
    if not is_configured():
        return []

    url = f"{settings.AUTHENTIK_API_URL.rstrip('/')}/core/users/"
    headers = {"Authorization": f"Bearer {settings.AUTHENTIK_API_TOKEN}"}
    params: dict[str, str | int] = {"search": q, "page_size": limit}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Never break the admin flow on an Authentik hiccup; log and degrade.
        logger.warning(f"Authentik user search failed: {exc}")
        return []

    results: list[AuthentikUser] = []
    for item in data.get("results", []):
        uuid = item.get("uuid")
        if not uuid:
            continue
        results.append(
            AuthentikUser(
                authentik_sub=str(uuid),
                name=item.get("name") or item.get("username") or "",
                username=item.get("username") or "",
                email=item.get("email") or None,
            )
        )
    return results


async def list_group_members(group_name: str) -> list[AuthentikUser]:
    """List all Authentik accounts belonging to ``group_name``.

    Follows Authentik pagination so groups larger than one page are complete.
    Returns an empty list when the API is not configured or on any transport
    error — callers should fall back to the locally-mirrored data.
    """
    if not is_configured():
        logger.warning(
            f"Authentik API not configured (AUTHENTIK_API_URL/AUTHENTIK_API_TOKEN); "
            f"cannot list members of group '{group_name}'"
        )
        return []

    url = f"{settings.AUTHENTIK_API_URL.rstrip('/')}/core/users/"
    headers = {"Authorization": f"Bearer {settings.AUTHENTIK_API_TOKEN}"}
    items: list[dict] = []
    page = 1

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            while True:
                params: dict[str, str | int] = {
                    "groups_by_name": group_name,
                    "page_size": _GROUP_PAGE_SIZE,
                    "page": page,
                }
                resp = await client.get(url, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
                items.extend(data.get("results", []))
                next_page = (data.get("pagination") or {}).get("next")
                if not next_page or page >= _MAX_GROUP_PAGES:
                    break
                page = int(next_page)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(f"Authentik group member lookup failed for '{group_name}': {exc}")
        return []

    results: list[AuthentikUser] = []
    for item in items:
        uuid = item.get("uuid")
        if not uuid:
            continue
        results.append(
            AuthentikUser(
                authentik_sub=str(uuid),
                name=item.get("name") or item.get("username") or "",
                username=item.get("username") or "",
                email=item.get("email") or None,
            )
        )
    if not results:
        logger.warning(f"Authentik returned no members for group '{group_name}'")
    else:
        logger.info(f"Authentik group '{group_name}': {len(results)} members")
    return results
