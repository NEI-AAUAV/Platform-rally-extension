"""API integration tests for rally settings (public view), against real Postgres."""
from datetime import datetime, timezone

from app.crud.crud_rally_settings import rally_settings
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate


async def _make_event(pg_session, event_type="peddy_paper"):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True, event_type=event_type)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_settings(pg_session, **overrides):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, **overrides)
    )


class TestRallySettingsAPI:
    async def test_get_rally_settings_public(self, pg_session, pg_client):
        await _make_event(pg_session, event_type="peddy_paper")
        await _set_settings(pg_session, public_access_enabled=True, max_members_per_team=4)

        response = pg_client.get("/api/rally/v1/rally/settings/public")

        assert response.status_code == 200
        data = response.json()
        assert data["public_access_enabled"] is True
        assert data["max_members_per_team"] == 4
        # event_type is folded in from the current event, not the settings row.
        assert data["event_type"] == "peddy_paper"


class TestTimezoneHandling:
    def test_datetime_comparison_utc(self):
        start_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        end_time = datetime(2024, 1, 15, 18, 0, 0, tzinfo=timezone.utc)

        assert start_time < end_time
        assert (end_time - start_time).total_seconds() == 8 * 3600
