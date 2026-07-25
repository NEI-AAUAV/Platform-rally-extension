"""API tests for the read-only badge endpoints, against real Postgres."""

from app.crud.crud_badge_definition import badge_definition as crud_def
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.schemas.badge_definition import BadgeDefinitionCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.services import badge_service
from app.tests.conftest import make_event as _make_event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_badges_enabled(pg_session, enabled: bool):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, badges_enabled=enabled)
    )


async def _make_definition(pg_session, code: str, active=True):
    return await crud_def.create(
        pg_session, obj_in=BadgeDefinitionCreate(code=code, name=code.title(), is_active=active)
    )


async def test_list_all_badges(pg_session, pg_client):
    await _make_event(pg_session)
    await _set_badges_enabled(pg_session, True)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
    await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="head_to_head_win", activity_id=99
    )

    resp = pg_client.get("/api/rally/v1/badges")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["team_id"] == team.id
    assert body[0]["badge_type"] == "head_to_head_win"
    assert body[0]["activity_id"] == 99


async def test_list_team_badges(pg_session, pg_client):
    await _make_event(pg_session)
    await _set_badges_enabled(pg_session, True)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
    other = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamB"))
    await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="first_to_complete_activity", activity_id=5
    )
    await badge_service.award_badge(
        pg_session, team_id=other.id, badge_code="head_to_head_win", activity_id=1
    )

    resp = pg_client.get(f"/api/rally/v1/teams/{team.id}/badges")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["badge_type"] == "first_to_complete_activity"


async def test_team_badge_showcase(pg_session, pg_client):
    await _make_event(pg_session)
    await _set_badges_enabled(pg_session, True)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
    await _make_definition(pg_session, "won_duel")
    await _make_definition(pg_session, "locked_one")
    await badge_service.award_badge(
        pg_session, team_id=team.id, badge_code="won_duel", activity_id=99
    )

    resp = pg_client.get(f"/api/rally/v1/teams/{team.id}/badge-showcase")

    assert resp.status_code == 200
    body = resp.json()
    codes = [d["code"] for d in body["definitions"]]
    assert codes == ["won_duel", "locked_one"]
    earned_codes = [e["code"] for e in body["earned"]]
    assert earned_codes == ["won_duel"]
    assert "locked_one" not in earned_codes


class TestKillSwitch:
    async def test_list_all_badges_empty_when_disabled(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_badges_enabled(pg_session, False)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
        await badge_service.award_badge(
            pg_session, team_id=team.id, badge_code="won_duel", activity_id=1
        )

        resp = pg_client.get("/api/rally/v1/badges")

        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_team_badges_empty_when_disabled(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_badges_enabled(pg_session, False)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
        await badge_service.award_badge(
            pg_session, team_id=team.id, badge_code="won_duel", activity_id=1
        )

        resp = pg_client.get(f"/api/rally/v1/teams/{team.id}/badges")

        assert resp.status_code == 200
        assert resp.json() == []

    async def test_showcase_empty_when_disabled(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _set_badges_enabled(pg_session, False)
        team = await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))
        await _make_definition(pg_session, "won_duel")

        resp = pg_client.get(f"/api/rally/v1/teams/{team.id}/badge-showcase")

        assert resp.status_code == 200
        body = resp.json()
        assert body["definitions"] == []
        assert body["earned"] == []
