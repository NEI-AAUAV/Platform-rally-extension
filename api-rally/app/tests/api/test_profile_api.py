"""API tests for the profile / participation-history endpoints, against real Postgres."""
from app.crud.crud_participation import CRUDParticipation
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.team import TeamCreate
from app.schemas.user import UserCreate


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Rally 2026", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_team(pg_session, name="Os Bons"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


class TestProfileMe:
    async def test_profile_me_lists_participations(self, pg_session, pg_client, as_admin):
        event = await _make_event(pg_session)
        team = await _make_team(pg_session)
        me = await crud_user.create_for_oidc(
            pg_session,
            authentik_sub="test-admin-sub",
            name="Ana",
            email="ana@nei.pt",
            scopes=["admin"],
        )
        await CRUDParticipation().record(
            pg_session, authentik_sub="test-admin-sub", event_id=event.id, team=team, is_captain=True
        )

        resp = pg_client.get("/api/rally/v1/profile/me")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["authentik_sub"] == "test-admin-sub"
        assert len(body["participations"]) == 1
        entry = body["participations"][0]
        assert entry["event_name"] == "Rally 2026"
        assert entry["team_name"] == "Os Bons"


class TestProfileHistory:
    async def test_history_returns_entries(self, pg_session, pg_client, as_admin):
        event = await _make_event(pg_session)
        team = await _make_team(pg_session)
        await CRUDParticipation().record(
            pg_session, authentik_sub="test-admin-sub", event_id=event.id, team=team
        )

        resp = pg_client.get("/api/rally/v1/profile/history")

        assert resp.status_code == 200
        assert resp.json()[0]["event_id"] == event.id


class TestClaimable:
    async def test_claimable_lists_only_placeholders(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name="João"))
        placeholder.team_id = team.id
        pg_session.add(placeholder)
        captain = await crud_user.create(pg_session, obj_in=UserCreate(name="Rita"))
        captain.team_id = team.id
        captain.is_captain = True
        pg_session.add(captain)
        await pg_session.commit()

        resp = pg_client.get(
            "/api/rally/v1/profile/claimable", params={"access_code": team.access_code}
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["team_id"] == team.id
        assert body["team_name"] == team.name
        assert {m["name"] for m in body["members"]} == {"João", "Rita"}

    async def test_claimable_unknown_code_returns_404(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get(
            "/api/rally/v1/profile/claimable", params={"access_code": "NOPE-0000"}
        )

        assert resp.status_code == 404
