"""Tests for CRUDRallySettings, against real Postgres.

Covers the legacy unscoped-row adoption path, timing sync from the current
event, home_layout/ticker_items self-healing, and the branding image field
guard.
"""
from datetime import datetime, timezone

import pytest

from app.crud.crud_rally_settings import rally_settings
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import DEFAULT_HOME_LAYOUT, DEFAULT_TICKER_ITEMS


async def _make_event(pg_session, **overrides):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True, **overrides)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


class TestGetOrCreate:
    async def test_creates_default_settings_for_new_event(self, pg_session):
        await _make_event(pg_session)

        settings = await rally_settings.get_or_create(pg_session)

        assert settings.event_id is not None
        assert settings.max_teams == 14
        assert settings.home_layout == list(DEFAULT_HOME_LAYOUT)

    async def test_adopts_legacy_unscoped_row(self, pg_session):
        """A pre-existing settings row with event_id=NULL (single-event era)
        must be adopted onto the current event instead of creating a second,
        duplicate row."""
        event = await _make_event(pg_session)
        legacy = RallySettings(
            event_id=None,
            max_teams=99,
            max_members_per_team=5,
            enable_versus=False,
            penalty_per_puke=-1,
            penalty_per_not_drinking=-1,
            bonus_per_extra_shot=1,
            max_extra_shots_per_member=1,
            checkpoint_order_matters=True,
            enable_staff_scoring=True,
            show_live_leaderboard=True,
            show_team_details=True,
            show_checkpoint_map=True,
            participant_view_enabled=False,
            show_route_mode="focused",
            show_score_mode="hidden",
            rally_theme="legacy",
            event_name="Legacy Rally",
            event_subtitle="",
            accent_color="",
            banner_url="",
            logo_url="",
            favicon_url="",
            public_access_enabled=True,
            home_layout=[],
            ticker_items=[],
        )
        pg_session.add(legacy)
        await pg_session.commit()

        settings = await rally_settings.get_or_create(pg_session)

        assert settings.id == legacy.id
        assert settings.event_id == event.id
        assert settings.max_teams == 99  # legacy values preserved, not defaults

    async def test_syncs_timing_from_event_on_change(self, pg_session):
        """Rally timing must mirror the event's start/end time even after the
        settings row already exists -- an event edit propagates on next read."""
        event = await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        assert settings.rally_start_time is None

        start = datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc).replace(tzinfo=None)
        end = datetime(2026, 1, 1, 18, 0, tzinfo=timezone.utc).replace(tzinfo=None)
        event.start_time = start
        event.end_time = end
        pg_session.add(event)
        await pg_session.commit()

        refreshed = await rally_settings.get_or_create(pg_session)

        assert refreshed.rally_start_time.replace(tzinfo=None) == start
        assert refreshed.rally_end_time.replace(tzinfo=None) == end

    async def test_normalizes_legacy_empty_home_layout(self, pg_session):
        """A settings row whose home_layout/ticker_items are empty (legacy
        row created before those columns existed) gets self-healed to the
        full default set on next read."""
        await _make_event(pg_session)
        settings = await rally_settings.get_or_create(pg_session)
        settings.home_layout = []
        settings.ticker_items = []
        pg_session.add(settings)
        await pg_session.commit()

        refreshed = await rally_settings.get_or_create(pg_session)

        assert refreshed.home_layout == list(DEFAULT_HOME_LAYOUT)
        assert refreshed.ticker_items == list(DEFAULT_TICKER_ITEMS)


class TestSetImageUrl:
    async def test_sets_banner_url(self, pg_session):
        await _make_event(pg_session)

        updated = await rally_settings.set_image_url(
            pg_session, field="banner_url", url="https://r2/banner.png"
        )

        assert updated.banner_url == "https://r2/banner.png"

    async def test_rejects_unsupported_field(self, pg_session):
        await _make_event(pg_session)

        with pytest.raises(ValueError, match="Unsupported branding image field"):
            await rally_settings.set_image_url(pg_session, field="not_a_field", url="x")
