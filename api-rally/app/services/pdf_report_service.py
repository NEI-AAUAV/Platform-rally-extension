"""PDF final report for a single event.

A printable/archivable summary of a finished event — the human-readable
counterpart to the Excel export (`export_service.py`), which is built for
reprocessing, not reading. Four sections, in order:

1. **Ranking final** — teams by total score, podium highlighted.
2. **Detalhe por posto** — one table per checkpoint, same columns as the
   Excel per-checkpoint sheets.
3. **Fotos capturadas** — a grid of team photos and deferred-judged capture
   photos, best-effort (a photo that fails to download is silently skipped
   rather than failing the whole report).
4. **Estatísticas do evento** — duration, team count, total penalties
   applied, best/worst average-scoring checkpoint.

Reads via `EventResultsQuery`/`EventResultsData` — the same aggregation the
Excel export uses, so the two documents can never disagree on what a team's
score at a checkpoint is.
"""

from __future__ import annotations

import ipaddress
import socket
from datetime import datetime
from io import BytesIO
from urllib.parse import urlparse

import requests
from fastapi.concurrency import run_in_threadpool
from loguru import logger
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.crud_activity import rally_event as crud_rally_event
from app.models.activity import RallyEvent
from app.services.event_results_query import (
    EventResultsData,
    EventResultsQuery,
    result_notes,
    result_penalty,
)

_PHOTO_FETCH_TIMEOUT_S = 5
_MAX_PHOTOS = 24  # keep the report a reasonable size/length

_PODIUM_FILLS = {
    1: colors.HexColor("#FFD700"),
    2: colors.HexColor("#C0C0C0"),
    3: colors.HexColor("#CD7F32"),
}
_HEADER_BG = colors.HexColor("#1F2937")


class PdfReportService:
    """Builds the final-report PDF for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._query = EventResultsQuery(db)
        self._styles = getSampleStyleSheet()

    async def build_report(self, event_id: int) -> bytes:
        event = await crud_rally_event.get(self.db, event_id)
        data = await self._query.load(event_id)

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
        story: list[object] = []
        story += self._cover(event.name if event else f"Evento #{event_id}")
        story += self._ranking_section(data)
        story.append(PageBreak())
        story += self._checkpoints_section(data)
        story.append(PageBreak())
        story += await self._photos_section(data)
        story.append(PageBreak())
        story += self._stats_section(event, data)

        doc.build(story)
        return buffer.getvalue()

    # ---------- cover ----------

    def _cover(self, event_name: str) -> list[object]:
        title = ParagraphStyle(
            "CoverTitle", parent=self._styles["Title"], fontSize=26, spaceAfter=6
        )
        subtitle = ParagraphStyle("CoverSubtitle", parent=self._styles["Normal"], fontSize=13)
        return [
            Spacer(1, 4 * cm),
            Paragraph(event_name, title),
            Paragraph("Relatório Final", subtitle),
            Paragraph(datetime.now().strftime("%d/%m/%Y"), subtitle),
            PageBreak(),
        ]

    # ---------- ranking ----------

    def _ranking_section(self, data: EventResultsData) -> list[object]:
        story: list[object] = [Paragraph("Ranking Final", self._styles["Heading1"])]

        ranked = sorted(data.teams, key=lambda t: data.team_total(t.id), reverse=True)
        rows: list[list[object]] = [["#", "Equipa", "Pontos"]]
        for position, team in enumerate(ranked, start=1):
            rows.append([str(position), team.name, f"{data.team_total(team.id):.0f}"])

        table = Table(rows, colWidths=[1.5 * cm, 10 * cm, 4 * cm])
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("ALIGN", (1, 1), (1, -1), "LEFT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]
        for position, fill in _PODIUM_FILLS.items():
            if position <= len(ranked):
                style.append(("BACKGROUND", (0, position), (-1, position), fill))
        table.setStyle(TableStyle(style))
        story.append(table)
        return story

    # ---------- per-checkpoint detail ----------

    def _checkpoints_section(self, data: EventResultsData) -> list[object]:
        story: list[object] = [Paragraph("Detalhe por Posto", self._styles["Heading1"])]
        for index, checkpoint in enumerate(data.checkpoints, start=1):
            story.append(Paragraph(f"Posto {index}: {checkpoint.name}", self._styles["Heading2"]))
            rows: list[list[object]] = [
                ["Equipa", "Pontos", "Tiros extra", "Vómitos (-)", "Não bebeu (-)", "Notas"]
            ]
            for team in data.teams:
                key = (team.id, checkpoint.id)
                result = data.cp_result.get(key)
                total = data.cp_score.get(key, 0.0)
                if result is None:
                    rows.append([team.name, f"{total:.0f}", "0", "0", "0", ""])
                    continue
                rows.append(
                    [
                        team.name,
                        f"{total:.0f}",
                        str(int(result.extra_shots or 0)),
                        str(result_penalty(result, "vomit")),
                        str(result_penalty(result, "not_drinking")),
                        result_notes(result),
                    ]
                )
            table = Table(rows, colWidths=[4 * cm, 2 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 4.5 * cm])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ]
                )
            )
            story.append(table)
            story.append(Spacer(1, 0.5 * cm))
        return story

    # ---------- photos ----------

    @staticmethod
    def _photo_urls(data: EventResultsData) -> list[tuple[str, str]]:
        """(caption, url) pairs — team photos first, then deferred-judged
        capture photos, capped at `_MAX_PHOTOS` so the report stays a
        reasonable length. Reuses `data.teams`/`data.results`, already
        scoped to this event by `EventResultsQuery.load`."""
        pairs = [(f"Equipa: {t.name}", t.photo_url) for t in data.teams if t.photo_url]

        for r in data.results:
            for url in r.media_urls or []:
                pairs.append((f"Captura da equipa #{r.team_id}", url))

        return pairs[:_MAX_PHOTOS]

    @staticmethod
    def _is_safe_photo_url(url: str) -> bool:
        """Photo URLs come from the DB (Team.photo_url / ActivityResult.
        media_urls) — every legitimate one was written by validate_and_store
        pointing at our own R2 bucket, but a fetch-by-URL from server code is
        an SSRF vector if that ever isn't true (a bad write, a future field
        that accepts an arbitrary URL). Reject anything not on the
        configured public bucket host, and reject that host resolving to a
        private/loopback/link-local address so a misconfigured
        R2_PUBLIC_BASE_URL can't turn this into an internal-network probe.
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

    @staticmethod
    def _download_image(url: str) -> bytes | None:
        if not PdfReportService._is_safe_photo_url(url):
            logger.warning(f"Skipping photo in PDF report (URL not allowed): {url[:60]}...")
            return None
        try:
            resp = requests.get(url, timeout=_PHOTO_FETCH_TIMEOUT_S, allow_redirects=False)
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            logger.warning(f"Skipping photo in PDF report (download failed): {url[:60]}... {exc}")
            return None

    async def _photos_section(self, data: EventResultsData) -> list[object]:
        story: list[object] = [Paragraph("Fotos Capturadas", self._styles["Heading1"])]
        pairs = self._photo_urls(data)

        if not pairs:
            story.append(Paragraph("Sem fotos disponíveis.", self._styles["Normal"]))
            return story

        for caption, url in pairs:
            content = await run_in_threadpool(self._download_image, url)
            if content is None:
                continue
            try:
                img = Image(BytesIO(content), width=8 * cm, height=8 * cm, kind="proportional")
            except Exception as exc:  # noqa: BLE001 — any decode failure just skips this photo
                logger.warning(f"Skipping unreadable photo in PDF report: {exc}")
                continue
            story.append(img)
            story.append(Paragraph(caption, self._styles["Normal"]))
            story.append(Spacer(1, 0.4 * cm))
        return story

    # ---------- stats ----------

    def _stats_section(self, event: RallyEvent | None, data: EventResultsData) -> list[object]:
        story: list[object] = [Paragraph("Estatísticas do Evento", self._styles["Heading1"])]

        start = event.start_time if event else None
        end = event.end_time if event else None
        duration_text = "—"
        if start is not None and end is not None and end > start:
            duration_text = str(end - start)

        total_penalties = sum(
            result_penalty(r, "vomit") + result_penalty(r, "not_drinking") for r in data.results
        )

        cp_averages: dict[int, float] = {}
        for checkpoint in data.checkpoints:
            scores = [
                score
                for (_team_id, cp_id), score in data.cp_score.items()
                if cp_id == checkpoint.id
            ]
            if scores:
                cp_averages[checkpoint.id] = sum(scores) / len(scores)

        best_cp = max(cp_averages.items(), key=lambda kv: kv[1], default=None)
        worst_cp = min(cp_averages.items(), key=lambda kv: kv[1], default=None)
        cp_name = {cp.id: cp.name for cp in data.checkpoints}

        rows = [
            ["Duração do evento", duration_text],
            ["Número de equipas", str(len(data.teams))],
            ["Número de postos", str(len(data.checkpoints))],
            ["Penalizações totais aplicadas", str(total_penalties)],
            [
                "Posto com maior pontuação média",
                cp_name.get(best_cp[0], "—") if best_cp else "—",
            ],
            [
                "Posto com menor pontuação média",
                cp_name.get(worst_cp[0], "—") if worst_cp else "—",
            ],
        ]
        table = Table(rows, colWidths=[8 * cm, 8 * cm])
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(table)
        return story
