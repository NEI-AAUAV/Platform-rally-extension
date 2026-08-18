from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.crud.base import CRUDBase
from app.crud.crud_activity import rally_event
from app.models.activity import EventType, RallyEvent
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import (
    DEFAULT_HOME_LAYOUT,
    DEFAULT_TICKER_ITEMS,
    RallySettingsUpdate,
    normalize_home_layout,
    normalize_ticker_items,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class CRUDRallySettings(CRUDBase[RallySettings, RallySettingsUpdate, RallySettingsUpdate]):
    async def get_or_create(self, db: "AsyncSession") -> RallySettings:
        """Return the current event's settings row, creating it if missing.

        Settings are now per-event: the current event is resolved (and lazily
        bootstrapped) via crud.rally_event, then its settings row is fetched or
        created with sensible defaults. Callers are unchanged — they still get
        back a single RallySettings object for "the active rally".
        """
        event = await rally_event.ensure_current(db)
        # Snapshot the id: a rollback below expires `event`, and reading any
        # attribute off an expired instance from async code emits sync IO
        # (MissingGreenlet). See _reload_event.
        event_id = event.id
        settings = await db.scalar(select(RallySettings).where(RallySettings.event_id == event_id))
        if settings is not None:
            settings = await self._normalize_home_fields(db, settings)
            return await self._sync_timing_from_event(db, settings, event)

        # Fall back to adopting a legacy unscoped row (event_id NULL) once, so
        # existing single-event deployments keep their configured values.
        legacy = await db.scalar(select(RallySettings).where(RallySettings.event_id.is_(None)))
        if legacy is not None:
            legacy.event_id = event_id  # type: ignore[assignment]
            db.add(legacy)
            try:
                await db.commit()
            except IntegrityError:
                # Another caller already claimed this event's settings row (see
                # the same race below); use theirs.
                await db.rollback()
                event = await self._reload_event(db, event_id)
                adopted = await db.scalar(
                    select(RallySettings).where(RallySettings.event_id == event_id)
                )
                if adopted is None:
                    raise
                adopted = await self._normalize_home_fields(db, adopted)
                return await self._sync_timing_from_event(db, adopted, event)
            await db.refresh(legacy)
            legacy = await self._normalize_home_fields(db, legacy)
            return await self._sync_timing_from_event(db, legacy, event)

        settings = RallySettings(
            event_id=event_id,
            # Team management
            max_teams=14,
            max_members_per_team=10,
            enable_versus=True,
            # Rally timing
            rally_start_time=None,
            rally_end_time=None,
            # Scoring system
            penalty_per_puke=-10,
            penalty_per_not_drinking=-2,
            bonus_per_extra_shot=1,
            max_extra_shots_per_member=5,
            # Checkpoint behavior
            checkpoint_order_matters=True,
            # GPS self-check-in: on by default for peddy paper, where reaching
            # the post *is* the mechanic; off for formats that check teams in
            # through staff or QR.
            gps_checkin_enabled=event.event_type == EventType.PEDDY_PAPER.value,
            # Redact next checkpoint until check-in for peddy paper, where the
            # location itself is the puzzle answer; every other format keeps
            # today's fully-revealed next checkpoint.
            reveal_next_checkpoint=event.event_type != EventType.PEDDY_PAPER.value,
            # Asking for a hint costs points in a peddy paper (the riddle is
            # the game); other formats have no hint economy, so it stays free.
            hint_penalty=-10 if event.event_type == EventType.PEDDY_PAPER.value else 0,
            # Giving up forfeits the post's score too, so it costs more than a
            # hint. Only peddy paper can strand a team on a riddle at all.
            skip_penalty=-25 if event.event_type == EventType.PEDDY_PAPER.value else 0,
            # Staff and scoring
            enable_staff_scoring=True,
            # Display settings
            show_live_leaderboard=True,
            show_team_details=True,
            show_checkpoint_map=True,
            # Peddy paper's participant view is the clue/check-in screen —
            # equipas belong there by default. Other formats keep the
            # existing opt-in (staff must switch it on).
            participant_view_enabled=event.event_type == EventType.PEDDY_PAPER.value,
            show_route_mode="focused",
            show_score_mode="hidden",
            # Rally customization
            rally_theme="Rally Tascas - Competição de Equipas",
            # Universal branding
            event_name="Rally Tascas",
            event_subtitle="Competição de Equipas",
            accent_color="",
            banner_url="",
            logo_url="",
            favicon_url="",
            rules_pdf_url="",
            rules_content={},
            # Access control
            public_access_enabled=True,
            # Home page layout
            home_layout=list(DEFAULT_HOME_LAYOUT),
            ticker_items=list(DEFAULT_TICKER_ITEMS),
        )
        db.add(settings)
        try:
            await db.commit()
        except IntegrityError:
            # event_id is unique: several workers (API requests, the badges and
            # leaderboard workers) can reach this insert concurrently for the
            # same event and all but one lose the race. The loser adopts the
            # row the winner committed instead of surfacing the violation.
            await db.rollback()
            event = await self._reload_event(db, event_id)
            settings = await db.scalar(
                select(RallySettings).where(RallySettings.event_id == event_id)
            )
            if settings is None:
                raise
            settings = await self._normalize_home_fields(db, settings)
        else:
            await db.refresh(settings)

        return await self._sync_timing_from_event(db, settings, event)

    @staticmethod
    async def _reload_event(db: "AsyncSession", event_id: int) -> RallyEvent:
        """Re-load the event after a rollback so its attributes stay usable.

        ``rollback()`` expires every instance in the session regardless of
        ``expire_on_commit``. Any later plain attribute read (e.g. the
        ``getattr(event, "start_time")`` in :meth:`_sync_timing_from_event`)
        would then trigger a *synchronous* lazy refresh from async code and
        raise ``MissingGreenlet``. Awaiting the reload here keeps that IO on
        the async path; a row that vanished under us falls back to
        ``ensure_current``.
        """
        merged = await db.get(RallyEvent, event_id)
        if merged is not None:
            return merged
        reloaded: RallyEvent = await rally_event.ensure_current(db)
        return reloaded

    async def _sync_timing_from_event(
        self, db: "AsyncSession", settings: RallySettings, event: object
    ) -> RallySettings:
        """Keep settings timing in lockstep with the event's start/end time.

        The event record is the single source of truth for rally timing, so
        an admin no longer has to set the schedule twice. The settings row
        still carries its own columns (consumed throughout the app), but they
        are always overwritten from the event here rather than edited
        independently.
        """
        event_start = getattr(event, "start_time", None)
        event_end = getattr(event, "end_time", None)
        if settings.rally_start_time != event_start or settings.rally_end_time != event_end:
            settings.rally_start_time = event_start  # type: ignore[assignment]
            settings.rally_end_time = event_end  # type: ignore[assignment]
            db.add(settings)
            await db.commit()
            await db.refresh(settings)
        return settings

    async def _normalize_home_fields(
        self, db: "AsyncSession", settings: RallySettings
    ) -> RallySettings:
        """Self-heal legacy rows whose home_layout/ticker_items are empty or
        missing known section keys, without disturbing an admin's existing
        order/visibility choices for keys already present.
        """
        normalized_layout = normalize_home_layout(settings.home_layout)  # type: ignore[arg-type]
        normalized_ticker = normalize_ticker_items(settings.ticker_items) or list(  # type: ignore[arg-type]
            DEFAULT_TICKER_ITEMS
        )

        changed = normalized_layout != (settings.home_layout or []) or normalized_ticker != (
            settings.ticker_items or []
        )
        if changed:
            settings.home_layout = normalized_layout  # type: ignore[assignment]
            settings.ticker_items = normalized_ticker  # type: ignore[assignment]
            db.add(settings)
            await db.commit()
            await db.refresh(settings)
        return settings

    async def set_image_url(self, db: "AsyncSession", *, field: str, url: str) -> RallySettings:
        """Persist a single branding image URL column (banner_url/logo_url).

        Kept separate from update() so image URLs are only ever written by the
        R2 upload endpoints, never by a plain settings PUT.
        """
        if field not in ("banner_url", "logo_url", "favicon_url", "rules_pdf_url"):
            raise ValueError(f"Unsupported branding image field: {field}")

        settings = await self.get_or_create(db)
        setattr(settings, field, url)
        await db.commit()
        await db.refresh(settings)
        return settings


rally_settings = CRUDRallySettings(RallySettings)
