from typing import TYPE_CHECKING

from sqlalchemy import select

from app.crud.base import CRUDBase
from app.crud.crud_activity import rally_event
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
        settings = await db.scalar(select(RallySettings).where(RallySettings.event_id == event.id))
        if settings is not None:
            settings = await self._normalize_home_fields(db, settings)
            return await self._sync_timing_from_event(db, settings, event)

        # Fall back to adopting a legacy unscoped row (event_id NULL) once, so
        # existing single-event deployments keep their configured values.
        legacy = await db.scalar(select(RallySettings).where(RallySettings.event_id.is_(None)))
        if legacy is not None:
            legacy.event_id = event.id  # type: ignore[assignment]
            db.add(legacy)
            await db.commit()
            await db.refresh(legacy)
            legacy = await self._normalize_home_fields(db, legacy)
            return await self._sync_timing_from_event(db, legacy, event)

        settings = RallySettings(
            event_id=event.id,
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
            # Staff and scoring
            enable_staff_scoring=True,
            # Display settings
            show_live_leaderboard=True,
            show_team_details=True,
            show_checkpoint_map=True,
            participant_view_enabled=False,
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
            # Access control
            public_access_enabled=True,
            # Home page layout
            home_layout=list(DEFAULT_HOME_LAYOUT),
            ticker_items=list(DEFAULT_TICKER_ITEMS),
        )
        db.add(settings)
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
        if field not in ("banner_url", "logo_url", "favicon_url"):
            raise ValueError(f"Unsupported branding image field: {field}")

        settings = await self.get_or_create(db)
        setattr(settings, field, url)
        await db.commit()
        await db.refresh(settings)
        return settings


rally_settings = CRUDRallySettings(RallySettings)
