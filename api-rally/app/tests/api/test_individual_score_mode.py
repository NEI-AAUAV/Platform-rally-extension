"""``show_score_mode == "individual"`` has to hold on the wire.

The mode means "each team sees only its own score". It used to be read by the
SPA only: the team directory, the pace ranking and the live scoreboard kept
serving every team's points and rank to anyone who asked the API directly.
"""

from contextlib import contextmanager

from sqlalchemy import update

from app.api import deps
from app.api.auth import AuthData, api_nei_auth_optional
from app.core.config import get_settings
from app.crud.crud_team import team as crud_team
from app.main import app
from app.models.team import Team
from app.schemas.team import TeamCreate
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.tests.conftest import make_event, set_rally_settings

TEAMS_URL = "/api/rally/v1/team/"


async def _set_score(pg_session, team: Team, total: int, classification: int) -> None:
    # Written after every team exists: creating a team recomputes the others.
    await pg_session.execute(
        update(Team).where(Team.id == team.id).values(total=total, classification=classification)
    )
    await pg_session.commit()


async def _individual_event(pg_session):
    await make_event(pg_session)
    await set_rally_settings(
        pg_session,
        public_access_enabled=True,
        show_live_leaderboard=True,
        show_score_mode="individual",
    )
    mine = await crud_team.create(pg_session, obj_in=TeamCreate(name="Mine"), commit=True)
    other = await crud_team.create(pg_session, obj_in=TeamCreate(name="Other"), commit=True)
    await _set_score(pg_session, mine, total=30, classification=2)
    await _set_score(pg_session, other, total=50, classification=1)
    return mine, other


@contextmanager
def _as_user(team_id: int | None = None, scopes: list[str] | None = None):
    user = DetailedUser(id=1, name="U", disabled=False, team_id=team_id, scopes=scopes or [])
    app.dependency_overrides[deps.get_current_user_optional] = lambda: user
    app.dependency_overrides[api_nei_auth_optional] = lambda: AuthData(
        oidc_sub="u1", name="U", scopes=scopes or []
    )
    try:
        yield
    finally:
        app.dependency_overrides.pop(deps.get_current_user_optional, None)
        app.dependency_overrides.pop(api_nei_auth_optional, None)


@contextmanager
def _as_team_token(team_id: int):
    app.dependency_overrides[deps.get_current_team_optional] = lambda: TeamTokenData(
        team_id=team_id, team_name="T"
    )
    try:
        yield
    finally:
        app.dependency_overrides.pop(deps.get_current_team_optional, None)


def _by_name(resp) -> dict[str, dict]:
    assert resp.status_code == 200, resp.text
    return {t["name"]: t for t in resp.json()}


class TestTeamDirectory:
    async def test_anonymous_sees_no_scores(self, pg_session, pg_client):
        await _individual_event(pg_session)

        teams = _by_name(pg_client.get(TEAMS_URL))

        for name in ("Mine", "Other"):
            assert teams[name]["total"] == 0
            assert teams[name]["classification"] == 0

    async def test_team_token_sees_only_its_own_score(self, pg_session, pg_client):
        mine, _ = await _individual_event(pg_session)

        with _as_team_token(mine.id):
            teams = _by_name(pg_client.get(TEAMS_URL))

        assert teams["Mine"]["total"] == 30
        assert teams["Mine"]["classification"] == 2
        assert teams["Other"]["total"] == 0
        assert teams["Other"]["classification"] == 0
        assert teams["Other"]["last_checkpoint_score"] is None

    async def test_participant_sees_only_its_own_score(self, pg_session, pg_client):
        mine, _ = await _individual_event(pg_session)

        with _as_user(team_id=mine.id):
            teams = _by_name(pg_client.get(TEAMS_URL))

        assert teams["Mine"]["total"] == 30
        assert teams["Other"]["total"] == 0

    async def test_staff_sees_every_score(self, pg_session, pg_client):
        await _individual_event(pg_session)

        with _as_user(scopes=["rally-staff"]):
            teams = _by_name(pg_client.get(TEAMS_URL))

        assert teams["Mine"]["total"] == 30
        assert teams["Other"]["total"] == 50
        assert teams["Other"]["classification"] == 1

    async def test_competitive_mode_still_shows_every_score(self, pg_session, pg_client):
        await _individual_event(pg_session)
        await set_rally_settings(pg_session, show_score_mode="competitive")

        teams = _by_name(pg_client.get(TEAMS_URL))

        assert teams["Other"]["total"] == 50


class TestTeamDetail:
    async def test_other_team_detail_is_redacted(self, pg_session, pg_client):
        mine, other = await _individual_event(pg_session)
        await set_rally_settings(pg_session, show_team_details=True)

        with _as_team_token(mine.id):
            resp = pg_client.get(f"{TEAMS_URL}{other.id}")

        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 0
        assert resp.json()["classification"] == 0

    async def test_own_team_detail_keeps_its_score(self, pg_session, pg_client):
        mine, _ = await _individual_event(pg_session)

        with _as_team_token(mine.id):
            resp = pg_client.get(f"{TEAMS_URL}{mine.id}")

        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 30
        assert resp.json()["classification"] == 2


class TestStandings:
    async def test_live_scoreboard_is_closed_to_teams(self, pg_session, pg_client):
        mine, _ = await _individual_event(pg_session)

        with _as_team_token(mine.id):
            resp = pg_client.get("/api/rally/v1/scoreboard/live")

        assert resp.status_code == 403, resp.text

    async def test_live_scoreboard_stays_open_to_staff(self, pg_session, pg_client):
        await _individual_event(pg_session)
        # Serve the ranking straight from Postgres: this is about the gate,
        # not the Redis cache, and CI runs the API tests without Redis.
        no_events = get_settings().model_copy(update={"EVENTS_ENABLED": False})
        app.dependency_overrides[get_settings] = lambda: no_events

        try:
            with _as_user(scopes=["rally-staff"]):
                resp = pg_client.get("/api/rally/v1/scoreboard/live")
        finally:
            app.dependency_overrides.pop(get_settings, None)

        assert resp.status_code == 200, resp.text

    async def test_pace_ranking_hides_other_teams(self, pg_session, pg_client):
        mine, other = await _individual_event(pg_session)

        with _as_team_token(mine.id):
            resp = pg_client.get("/api/rally/v1/rally/pace-ranking")

        assert resp.status_code == 200, resp.text
        entries = {e["id"]: e for e in resp.json()["entries"]}
        if other.id in entries:
            assert entries[other.id]["rank"] == 0
            assert entries[other.id]["elapsed_seconds"] is None


class TestOrderDoesNotLeakStandings:
    """Blanking the rank is not enough if the rows still arrive in rank order."""

    async def test_directory_is_ordered_by_name_when_redacted(self, pg_session, pg_client):
        mine, other = await _individual_event(pg_session)
        # "Other" leads; a name order that differs from the rank order.
        await _set_score(pg_session, other, total=90, classification=1)
        zed = await crud_team.create(pg_session, obj_in=TeamCreate(name="Aardvark"), commit=True)
        await _set_score(pg_session, zed, total=1, classification=3)

        with _as_team_token(mine.id):
            resp = pg_client.get(TEAMS_URL)

        assert [t["name"] for t in resp.json()] == ["Aardvark", "Mine", "Other"]

    async def test_pace_ranking_is_ordered_by_name_when_redacted(self, pg_session, pg_client):
        mine, _ = await _individual_event(pg_session)
        await crud_team.create(pg_session, obj_in=TeamCreate(name="Aardvark"), commit=True)

        with _as_team_token(mine.id):
            resp = pg_client.get("/api/rally/v1/rally/pace-ranking")

        assert resp.status_code == 200, resp.text
        names = [e["name"] for e in resp.json()["entries"]]
        assert names == sorted(names, key=str.casefold)
