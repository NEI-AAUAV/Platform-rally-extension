"""PDF final report for a single event.

A printable/archivable summary of a finished event — the human-readable
counterpart to the Excel export (`export_service.py`), which is built for
reprocessing, not reading.

Every section past the ranking is conditional: it appears only if the event
produced the thing it describes. A peddy paper with no photos gets no photo
pages, an event with no hints gets no hint section, and the per-checkpoint
tables carry only the counters that were actually recorded. The alternative —
a fixed template — is what made the old report describe an event that never
happened.

Reads via `EventResultsQuery`/`EventResultsData` and builds its per-checkpoint
columns with `event_report_columns`, both shared with the Excel export, so the
two documents can never disagree.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
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
from app.services.event_report_columns import (
    ABSENT_PDF,
    ReportColumn,
    checkpoint_columns,
    checkpoint_row,
)
from app.services.event_results_query import (
    EventResultsData,
    EventResultsQuery,
    result_count,
)

_PHOTO_FETCH_TIMEOUT_S = 5
_MAX_PHOTOS = 24  # keep the report a reasonable size/length

_PODIUM_FILLS = {
    1: colors.HexColor("#FFD700"),
    2: colors.HexColor("#C0C0C0"),
    3: colors.HexColor("#CD7F32"),
}
_HEADER_BG = colors.HexColor("#1F2937")

#: Usable width between the 2cm side margins of an A4 page.
_CONTENT_WIDTH = 17 * cm

_EVENT_TYPE_LABELS = {
    "rally_tascas": "Rally das Tascas",
    "peddy_paper": "Peddy Paper",
    "olympic": "Olimpíadas",
    "generic": "Evento",
}


class PdfReportService:
    """Builds the final-report PDF for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._query = EventResultsQuery(db)
        self._styles = getSampleStyleSheet()

    async def build_report(self, event_id: int) -> bytes:
        data = await self._query.load(event_id)

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)

        sections: list[Callable[[], list[object]]] = [
            lambda: self._ranking_section(data),
            lambda: self._checkpoints_section(data),
            lambda: self._hints_and_skips_section(data),
            lambda: self._awards_section(data),
            lambda: self._badges_section(data),
            lambda: self._stats_section(data),
        ]

        story: list[object] = self._cover(data, event_id)
        for build in sections:
            flowables = build()
            if not flowables:
                continue
            # The page break belongs between two sections that exist. Emitting
            # it unconditionally is how the old report produced blank pages
            # where a section had been skipped.
            if story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
            story += flowables

        photos = await self._photos_section(data)
        if photos:
            story.append(PageBreak())
            story += photos

        doc.build(story)
        return buffer.getvalue()

    # ---------- cover ----------

    def _cover(self, data: EventResultsData, event_id: int) -> list[object]:
        event = data.event
        name = getattr(event, "name", None) or f"Evento #{event_id}"
        title = ParagraphStyle(
            "CoverTitle", parent=self._styles["Title"], fontSize=26, spaceAfter=6
        )
        subtitle = ParagraphStyle("CoverSubtitle", parent=self._styles["Normal"], fontSize=13)

        lines = [Spacer(1, 4 * cm), Paragraph(name, title), Paragraph("Relatório Final", subtitle)]

        event_type = getattr(event, "event_type", None)
        if event_type:
            lines.append(
                Paragraph(_EVENT_TYPE_LABELS.get(str(event_type), str(event_type)), subtitle)
            )

        period = _period_text(event)
        if period:
            lines.append(Paragraph(period, subtitle))

        checkpoints = data.used_checkpoints()
        lines.append(
            Paragraph(
                f"{len(data.teams)} equipas · {len(checkpoints)} postos realizados",
                subtitle,
            )
        )
        lines.append(Paragraph(f"Emitido a {datetime.now().strftime('%d/%m/%Y')}", subtitle))
        lines.append(PageBreak())
        return lines

    # ---------- ranking ----------

    def _ranking_section(self, data: EventResultsData) -> list[object]:
        if not data.teams:
            return []

        story: list[object] = [Paragraph("Ranking Final", self._styles["Heading1"])]
        if data.has_pending_judgment:
            story.append(
                Paragraph(
                    "Classificação provisória: há resultados por avaliar.",
                    self._styles["Normal"],
                )
            )
            story.append(Spacer(1, 0.3 * cm))

        ranked = sorted(data.teams, key=lambda t: data.team_total(t.id), reverse=True)
        rows: list[list[object]] = [["#", "Equipa", "Pontos"]]
        for position, team in enumerate(ranked, start=1):
            label = f"{data.team_total(team.id):.0f}"
            if data.team_pending(team.id):
                label += " *"
            rows.append([str(position), team.name, label])

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
        checkpoints = data.used_checkpoints()
        if not checkpoints:
            return []

        columns = checkpoint_columns(data)
        headers = [c.header_pt for c in columns]
        story: list[object] = [Paragraph("Detalhe por Posto", self._styles["Heading1"])]

        for index, checkpoint in enumerate(checkpoints, start=1):
            story.append(Paragraph(f"Posto {index}: {checkpoint.name}", self._styles["Heading2"]))
            rows: list[list[object]] = [list(headers)]
            for team in data.teams:
                rows.append(
                    [
                        _cell(value)
                        for value in checkpoint_row(
                            data, columns, team, checkpoint, absent=ABSENT_PDF
                        )
                    ]
                )
            story.append(self._grid(rows, _column_widths(columns)))
            story.append(Spacer(1, 0.5 * cm))
        return story

    # ---------- hints & skips ----------

    def _hints_and_skips_section(self, data: EventResultsData) -> list[object]:
        if not (data.has_hints or data.has_skips):
            return []

        story: list[object] = [Paragraph("Pistas e Desistências", self._styles["Heading1"])]

        if data.has_hints:
            story.append(Paragraph("Pistas reveladas", self._styles["Heading2"]))
            rows: list[list[object]] = [["Equipa", "Posto", "Quando", "Custo"]]
            for reveal in data.hint_reveals:
                rows.append(
                    [
                        data.team_name(reveal.team_id),
                        data.checkpoint_name(reveal.checkpoint_id),
                        _timestamp(reveal.revealed_at),
                        str(int(reveal.cost or 0)),
                    ]
                )
            story.append(self._grid(rows, [5 * cm, 5 * cm, 4 * cm, 3 * cm]))
            story.append(Spacer(1, 0.5 * cm))

        if data.has_skips:
            story.append(Paragraph("Postos desistidos", self._styles["Heading2"]))
            rows = [["Equipa", "Posto", "Quando", "Custo"]]
            for skip in data.skips:
                rows.append(
                    [
                        data.team_name(skip.team_id),
                        data.checkpoint_name(skip.checkpoint_id),
                        _timestamp(skip.skipped_at),
                        str(int(skip.cost or 0)),
                    ]
                )
            story.append(self._grid(rows, [5 * cm, 5 * cm, 4 * cm, 3 * cm]))
        return story

    # ---------- manual awards ----------

    def _awards_section(self, data: EventResultsData) -> list[object]:
        awards = data.manual_awards()
        if not awards:
            return []

        story: list[object] = [Paragraph("Ajustes Manuais", self._styles["Heading1"])]
        rows: list[list[object]] = [["Equipa", "Pontos", "Motivo", "Quando"]]
        for award in awards:
            rows.append(
                [
                    data.team_name(award.team_id),
                    f"{float(award.points or 0):+.0f}",
                    award.reason or "",
                    _timestamp(award.awarded_at),
                ]
            )
        story.append(self._grid(rows, [4.5 * cm, 2.5 * cm, 6 * cm, 4 * cm]))
        return story

    # ---------- badges ----------

    def _badges_section(self, data: EventResultsData) -> list[object]:
        if not data.has_badges:
            return []

        story: list[object] = [Paragraph("Medalhas", self._styles["Heading1"])]
        rows: list[list[object]] = [["Equipa", "Medalha", "Posto", "Quando"]]
        for badge in data.badges:
            rows.append(
                [
                    data.team_name(badge.team_id),
                    str(badge.badge_type).replace("_", " ").capitalize(),
                    (
                        data.checkpoint_name(badge.checkpoint_id)
                        if badge.checkpoint_id is not None
                        else "—"
                    ),
                    _timestamp(badge.awarded_at),
                ]
            )
        story.append(self._grid(rows, [4.5 * cm, 5 * cm, 3.5 * cm, 4 * cm]))
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
            for url in getattr(r, "media_urls", None) or []:
                pairs.append((f"Captura: {data.team_name(r.team_id)}", url))

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
        pairs = self._photo_urls(data)
        if not pairs:
            return []

        images: list[object] = []
        for caption, url in pairs:
            content = await run_in_threadpool(self._download_image, url)
            if content is None:
                continue
            try:
                img = Image(BytesIO(content), width=8 * cm, height=8 * cm, kind="proportional")
            except Exception as exc:  # noqa: BLE001 — any decode failure just skips this photo
                logger.warning(f"Skipping unreadable photo in PDF report: {exc}")
                continue
            images.append(img)
            images.append(Paragraph(caption, self._styles["Normal"]))
            images.append(Spacer(1, 0.4 * cm))

        # Every photo failed to download: a heading over nothing is worse than
        # no section, so drop it the same way an event with no photos does.
        if not images:
            return []
        return [Paragraph("Fotos Capturadas", self._styles["Heading1"]), *images]

    # ---------- stats ----------

    def _stats_section(self, data: EventResultsData) -> list[object]:
        rows: list[list[object]] = []

        duration = _duration_text(data.event)
        if duration:
            rows.append(["Duração do evento", duration])
        rows.append(["Número de equipas", str(len(data.teams))])

        used = data.used_checkpoints()
        if len(used) == len(data.checkpoints):
            rows.append(["Número de postos", str(len(used))])
        else:
            rows.append(["Postos realizados", f"{len(used)} de {len(data.checkpoints)}"])

        for key in data.penalty_keys_used:
            total = sum(result_count(r, key) for r in data.results)
            rows.append([f"{data.key_label(key)} (penalização)", str(total)])
        for key in data.bonus_keys_used:
            total = sum(result_count(r, key, bonus=True) for r in data.results)
            rows.append([f"{data.key_label(key)} (bónus)", str(total)])

        if data.has_hints:
            cost = sum(int(h.cost or 0) for h in data.hint_reveals)
            rows.append(["Pistas reveladas", f"{len(data.hint_reveals)} ({cost:+d} pontos)"])
        if data.has_skips:
            cost = sum(int(s.cost or 0) for s in data.skips)
            rows.append(["Postos desistidos", f"{len(data.skips)} ({cost:+d} pontos)"])
        if data.has_badges:
            rows.append(["Medalhas atribuídas", str(len(data.badges))])
        if data.has_pending_judgment:
            rows.append(["Resultados por avaliar", str(len(data.pending))])

        rows += self._checkpoint_extremes(data)

        story: list[object] = [Paragraph("Estatísticas do Evento", self._styles["Heading1"])]
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

    @staticmethod
    def _checkpoint_extremes(data: EventResultsData) -> list[list[object]]:
        """Best/worst average-scoring checkpoint, when the comparison means anything.

        With fewer than two scored checkpoints the same post is both the best
        and the worst, which tells the reader nothing.
        """
        averages: dict[int, float] = {}
        for checkpoint in data.checkpoints:
            scores = [
                score
                for (_team_id, cp_id), score in data.cp_score.items()
                if cp_id == checkpoint.id
            ]
            if scores:
                averages[checkpoint.id] = sum(scores) / len(scores)

        if len(averages) < 2:
            return []

        best = max(averages.items(), key=lambda kv: kv[1])
        worst = min(averages.items(), key=lambda kv: kv[1])
        return [
            ["Posto com maior pontuação média", f"{data.checkpoint_name(best[0])} ({best[1]:.1f})"],
            [
                "Posto com menor pontuação média",
                f"{data.checkpoint_name(worst[0])} ({worst[1]:.1f})",
            ],
        ]

    # ---------- shared table styling ----------

    def _grid(self, rows: list[list[object]], col_widths: list[float]) -> Table:
        table = Table(rows, colWidths=col_widths)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        return table


def _column_widths(columns: list[ReportColumn]) -> list[float]:
    """Share the page width out, giving the text columns the slack.

    The column count is decided by the event, so fixed widths would overflow
    the page as soon as an event used more than a couple of counters.
    """
    weights = [2.0 if not column.numeric else 1.0 for column in columns]
    total = sum(weights) or 1.0
    return [_CONTENT_WIDTH * w / total for w in weights]


def _cell(value: object) -> str:
    if isinstance(value, float):
        return f"{value:.0f}"
    return str(value)


def _timestamp(value: object) -> str:
    return value.strftime("%d/%m %H:%M") if isinstance(value, datetime) else ""


def _period_text(event: object) -> str:
    start = getattr(event, "start_time", None)
    end = getattr(event, "end_time", None)
    if isinstance(start, datetime) and isinstance(end, datetime):
        return f"{start.strftime('%d/%m/%Y')} — {end.strftime('%d/%m/%Y')}"
    if isinstance(start, datetime):
        return start.strftime("%d/%m/%Y")
    return ""


def _duration_text(event: object) -> str:
    start = getattr(event, "start_time", None)
    end = getattr(event, "end_time", None)
    if isinstance(start, datetime) and isinstance(end, datetime) and end > start:
        return str(end - start)
    return ""
