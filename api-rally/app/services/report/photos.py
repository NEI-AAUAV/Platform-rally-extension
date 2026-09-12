"""Photo collection for the report, and the guard around fetching one.

Downloads are best effort: a photo that cannot be fetched or decoded is
skipped rather than failing the whole report, and a section whose photos all
failed is dropped rather than printed as a heading over nothing.
"""

from __future__ import annotations

import ipaddress
import socket
from io import BytesIO
from urllib.parse import urlparse

import requests
from fastapi.concurrency import run_in_threadpool
from loguru import logger
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, Spacer

from app.core.config import settings
from app.services.event_report_context import EventReportContext
from app.services.report.tables import styles

PHOTO_FETCH_TIMEOUT_S = 5
MAX_PHOTOS = 24  # keep the report a reasonable size/length


def photo_urls(ctx: EventReportContext) -> list[tuple[str, str]]:
    """(caption, url) pairs — team photos first, then capture photos.

    Capped at `MAX_PHOTOS` so the report stays a reasonable length.
    """
    data = ctx.results
    pairs = [(f"Equipa: {t.name}", t.photo_url) for t in data.teams if t.photo_url]

    for result in data.results:
        for url in getattr(result, "media_urls", None) or []:
            pairs.append((f"Captura: {data.team_name(result.team_id)}", url))

    return pairs[:MAX_PHOTOS]


def is_safe_photo_url(url: str) -> bool:
    """Photo URLs come from the DB (Team.photo_url / ActivityResult.
    media_urls) — every legitimate one was written by validate_and_store
    pointing at our own R2 bucket, but a fetch-by-URL from server code is an
    SSRF vector if that ever isn't true (a bad write, a future field that
    accepts an arbitrary URL). Reject anything not on the configured public
    bucket host, and reject that host resolving to a private/loopback/
    link-local address so a misconfigured R2_PUBLIC_BASE_URL can't turn this
    into an internal-network probe.
    """
    allowed_base = settings.R2_PUBLIC_BASE_URL
    if not allowed_base:
        return False
    parsed = urlparse(url)
    allowed = urlparse(allowed_base)
    if parsed.scheme != "https" or parsed.netloc != allowed.netloc:
        return False
    try:
        addr_infos = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        return False
    for _family, _type, _proto, _canon, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True


def download_image(url: str) -> bytes | None:
    if not is_safe_photo_url(url):
        logger.warning(f"Skipping photo in PDF report (URL not allowed): {url[:60]}...")
        return None
    try:
        resp = requests.get(url, timeout=PHOTO_FETCH_TIMEOUT_S, allow_redirects=False)
        resp.raise_for_status()
        return resp.content
    except requests.RequestException as exc:
        logger.warning(f"Skipping photo in PDF report (download failed): {url[:60]}... {exc}")
        return None


async def photos_section(ctx: EventReportContext) -> list[object]:
    pairs = photo_urls(ctx)
    if not pairs:
        return []

    images: list[object] = []
    for caption, url in pairs:
        content = await run_in_threadpool(download_image, url)
        if content is None:
            continue
        try:
            img = Image(BytesIO(content), width=8 * cm, height=8 * cm, kind="proportional")
        except Exception as exc:  # noqa: BLE001 — any decode failure just skips this photo
            logger.warning(f"Skipping unreadable photo in PDF report: {exc}")
            continue
        images.append(img)
        images.append(Paragraph(caption, styles()["Normal"]))
        images.append(Spacer(1, 0.4 * cm))

    # Every photo failed to download: a heading over nothing is worse than no
    # section, so drop it the same way an event with no photos does.
    if not images:
        return []
    return [Paragraph("Fotos Capturadas", styles()["Heading1"]), *images]
