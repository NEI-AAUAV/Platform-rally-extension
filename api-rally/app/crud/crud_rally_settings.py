from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.crud.base import CRUDBase
from app.crud.crud_activity import rally_event
from app.domain.event_configuration.policies import default_profile
from app.domain.event_configuration.settings import new_settings_for_profile
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
        # The race branches below use SAVEPOINTs and no longer call
        # db.rollback(), so `event` is never expired out from under us and its
        # id/attributes stay usable throughout.
        event_id = event.id
        settings = await db.scalar(select(RallySettings).where(RallySettings.event_id == event_id))
        if settings is not None:
            settings = await self._normalize_home_fields(db, settings)
            return await self._sync_timing_from_event(db, settings, event)

        # The unscoped-row adoption that used to live here is gone: migration
        # 0055 gave every settings row an event and made the column NOT NULL,
        # so there is no longer such a row to adopt.

        # Column defaults remain on RallySettings.  Profile defaults come from
        # the domain layer, so creation and format policies cannot drift.
        profile = event.event_profile or default_profile(event.event_type).value
        settings = new_settings_for_profile(
            event_id=event_id,
            event_type=event.event_type,
            profile=profile,
            config=event.config,
        )
        settings.rally_start_time = settings.rally_end_time = None  # type: ignore[assignment]
        settings.event_name = "Rally Tascas"  # type: ignore[assignment]
        settings.event_subtitle = "Competição de Equipas"  # type: ignore[assignment]
        settings.home_layout = list(DEFAULT_HOME_LAYOUT)  # type: ignore[assignment]
        settings.ticker_items = list(DEFAULT_TICKER_ITEMS)  # type: ignore[assignment]
        try:
            # SAVEPOINT: a losing race undoes only this insert, never the
            # caller's pending work in the surrounding transaction.
            async with db.begin_nested():
                db.add(settings)
                await db.flush()
        except IntegrityError:
            # event_id is unique: several workers (API requests, the badges and
            # leaderboard workers) can reach this insert concurrently for the
            # same event and all but one lose the race. The loser adopts the
            # row the winner committed instead of surfacing the violation.
            settings = await db.scalar(
                select(RallySettings).where(RallySettings.event_id == event_id)
            )
            if settings is None:
                raise
            settings = await self._normalize_home_fields(db, settings)
            return await self._sync_timing_from_event(db, settings, event)
        await db.commit()
        await db.refresh(settings)

        return await self._sync_timing_from_event(db, settings, event)

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
            # Flush, not commit: this self-heal must ride the caller's
            # transaction, not force (or roll back) a durability boundary on a
            # path that reads like a plain settings lookup. A caller that never
            # commits simply re-heals on the next call (a cheap comparison).
            await db.flush()
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
            # Flush, not commit — same reasoning as _sync_timing_from_event:
            # a self-heal on a read-shaped path must not own a commit/rollback.
            await db.flush()
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
