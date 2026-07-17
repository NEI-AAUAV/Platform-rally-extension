"""API tests for the profile / participation-history endpoints, against real Postgres."""
from app.crud.crud_participation import CRUDParticipation
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.team import TeamCreate
from app.schemas.user import UserCreate
from app.models.team import Team
from app.models.user import User


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
        await crud_user.create_for_oidc(
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

    async def test_profile_me_lazily_records_participation_when_on_team(self, pg_session, pg_client, as_admin):
        """When the caller is directly linked to a team via `user.team_id`,
        their participation in the current event is recorded on-the-fly."""
        event = await _make_event(pg_session)
        team = await _make_team(pg_session)
        me = await crud_user.create_for_oidc(
            pg_session,
            authentik_sub="test-admin-sub",
            name="Ana",
            email="ana@nei.pt",
            scopes=["admin"],
        )
        me.team_id = team.id
        me.is_captain = True
        pg_session.add(me)
        await pg_session.commit()

        resp = pg_client.get("/api/rally/v1/profile/me")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["current_team_id"] == team.id
        assert len(body["participations"]) == 1
        assert body["participations"][0]["event_id"] == event.id
        assert body["participations"][0]["is_captain"] is True


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


class TestClaimMembership:
    def test_claim_membership_not_found(self, pg_session, pg_client, as_admin):
        resp = pg_client.post("/api/rally/v1/profile/claim/999999")

        assert resp.status_code == 404

    async def test_claim_membership_already_linked(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        linked = await crud_user.create_for_oidc(
            pg_session, authentik_sub="already-linked-sub", name="Linked", email=None, scopes=[]
        )
        linked.team_id = team.id
        pg_session.add(linked)
        await pg_session.commit()

        resp = pg_client.post(f"/api/rally/v1/profile/claim/{linked.id}")

        assert resp.status_code == 400
        assert "already linked" in resp.json()["detail"].lower() or "already linked" in str(resp.json())

    async def test_claim_membership_not_on_team(self, pg_session, pg_client, as_admin):
        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name="NoTeam"))

        resp = pg_client.post(f"/api/rally/v1/profile/claim/{placeholder.id}")

        assert resp.status_code == 400

    async def test_claim_membership_team_not_found(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """The placeholder's team lookup misses (e.g. a race with a concurrent
        delete) -> 404, not an unhandled error. `Team.team_id`'s FK constraint
        prevents constructing this via plain data setup, so `AsyncSession.get`
        is patched (class-wide, since `pg_client` opens its own session per
        request) to return None specifically for the Team lookup."""


        team = await _make_team(pg_session)
        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name="Orphaned"))
        placeholder.team_id = team.id
        pg_session.add(placeholder)
        await pg_session.commit()

        real_get =  AsyncSession.get

        async def _fake_get(self, model, ident, *args, **kwargs):
            if model is Team:
                return None
            return await real_get(self, model, ident, *args, **kwargs)

        monkeypatch.setattr(AsyncSession, "get", _fake_get)

        resp = pg_client.post(f"/api/rally/v1/profile/claim/{placeholder.id}")

        assert resp.status_code == 404

    async def test_claim_membership_success_creates_caller_row(self, pg_session, pg_client, as_admin):
        """First-login case: caller has no `user` row yet, so claiming a
        placeholder must create one for them (create_for_oidc path)."""
        team = await _make_team(pg_session)
        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name="João"))
        placeholder.team_id = team.id
        placeholder.is_captain = True
        pg_session.add(placeholder)
        await pg_session.commit()
        placeholder_id = placeholder.id

        resp = pg_client.post(f"/api/rally/v1/profile/claim/{placeholder_id}")

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["team_id"] == team.id
        assert body["is_captain"] is True

        me = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="test-admin-sub")
        assert me is not None
        assert me.team_id == team.id

        pg_session.expire_all()
        assert await pg_session.get(User, placeholder_id) is None

    async def test_claim_membership_success_existing_caller_account(self, pg_session, pg_client, as_admin):
        """Caller already has a `user` row (e.g. from a prior claim/profile
        view) — the existing row is updated in place, not recreated."""
        team = await _make_team(pg_session)
        await crud_user.create_for_oidc(
            pg_session,
            authentik_sub="test-admin-sub",
            name="Ana",
            email="ana@nei.pt",
            scopes=["admin"],
        )
        placeholder = await crud_user.create(pg_session, obj_in=UserCreate(name="Rita"))
        placeholder.team_id = team.id
        pg_session.add(placeholder)
        await pg_session.commit()
        placeholder_id = placeholder.id

        resp = pg_client.post(f"/api/rally/v1/profile/claim/{placeholder_id}")

        assert resp.status_code == 201, resp.text
        me = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="test-admin-sub")
        assert me.team_id == team.id
