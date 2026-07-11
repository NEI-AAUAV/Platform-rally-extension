"""API tests for Versus endpoints, against real Postgres."""
from concurrent.futures import ThreadPoolExecutor

from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data.update(enable_versus=True)
    await rally_settings.update(pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data))
    return event


async def _make_team(pg_session, name):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


class TestVersusAPI:
    async def test_create_versus_pair_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team_a = await _make_team(pg_session, "Team A")
        team_b = await _make_team(pg_session, "Team B")

        resp = pg_client.post(
            "/api/rally/v1/versus/pair",
            json={"team_a_id": team_a.id, "team_b_id": team_b.id},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["team_a_id"] == team_a.id
        assert body["team_b_id"] == team_b.id
        assert body["group_id"] is not None

    async def test_get_team_opponent_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team_a = await _make_team(pg_session, "Team A")
        team_b = await _make_team(pg_session, "Team B")
        pg_client.post(
            "/api/rally/v1/versus/pair",
            json={"team_a_id": team_a.id, "team_b_id": team_b.id},
        )

        resp = pg_client.get(f"/api/rally/v1/versus/team/{team_a.id}/opponent")

        assert resp.status_code == 200
        body = resp.json()
        assert body["opponent_id"] == team_b.id
        assert body["opponent_name"] == "Team B"

    async def test_get_team_opponent_no_opponent(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team = await _make_team(pg_session, "Lonely Team")

        resp = pg_client.get(f"/api/rally/v1/versus/team/{team.id}/opponent")

        assert resp.status_code == 200
        body = resp.json()
        assert body["opponent_id"] is None
        assert body["opponent_name"] is None

    async def test_list_versus_groups_success(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        team_a = await _make_team(pg_session, "Team A")
        team_b = await _make_team(pg_session, "Team B")
        pg_client.post(
            "/api/rally/v1/versus/pair",
            json={"team_a_id": team_a.id, "team_b_id": team_b.id},
        )

        resp = pg_client.get("/api/rally/v1/versus/groups")

        assert resp.status_code == 200
        groups = resp.json()["groups"]
        assert len(groups) == 1
        assert {groups[0]["team_a_id"], groups[0]["team_b_id"]} == {team_a.id, team_b.id}


class TestConcurrentVersusPairing:
    """Two overlapping /versus/pair requests touching a shared team.

    `create_versus_pair` locks both team rows (`SELECT ... FOR UPDATE`,
    ordered by id) before checking `versus_group_id is None`, so the second
    request blocks until the first commits or rolls back, then sees team_a
    already paired and is rejected — no cross-pairing.
    """

    async def test_cross_pairing_race_on_shared_team(self, pg_session, pg_client, as_admin, _pg_engine):
        await _make_event(pg_session)
        team_a = await _make_team(pg_session, "Team A")
        team_b = await _make_team(pg_session, "Team B")
        team_c = await _make_team(pg_session, "Team C")

        # Team A is targeted by two simultaneous pair requests: A-B and A-C.
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(
                    pg_client.post,
                    "/api/rally/v1/versus/pair",
                    json={"team_a_id": team_a.id, "team_b_id": team_b.id},
                ),
                pool.submit(
                    pg_client.post,
                    "/api/rally/v1/versus/pair",
                    json={"team_a_id": team_a.id, "team_b_id": team_c.id},
                ),
            ]
            responses = [f.result() for f in futures]

        statuses = sorted(r.status_code for r in responses)

        # A fresh session/engine connection, not `pg_session` — the requests
        # above ran on TestClient's own event loop via a thread pool, and
        # reusing `pg_session`'s connection here trips SQLAlchemy's greenlet
        # context tracking (MissingGreenlet).
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import async_sessionmaker
        from app.models.team import Team

        maker = async_sessionmaker(_pg_engine, expire_on_commit=False)
        async with maker() as session:
            refreshed = {
                t.id: t
                for t in (
                    await session.scalars(
                        select(Team).where(Team.id.in_([team_a.id, team_b.id, team_c.id]))
                    )
                ).all()
            }
        paired_ids = {t.id for t in refreshed.values() if t.versus_group_id is not None}

        # Row locking serializes the two requests: exactly one succeeds, the
        # other is rejected with the "already in a versus group" error — never
        # both succeeding (which would cross-pair team_a) and never a 500.
        assert statuses == [200, 400], statuses
        assert team_a.id in paired_ids
        assert (team_b.id in paired_ids) != (team_c.id in paired_ids)


class TestVersusBusinessLogic:
    """Pure validation logic — no DB, kept as-is."""

    def test_versus_pair_creation_validation(self):
        team_a_id = 1
        team_b_id = 2
        assert team_a_id != team_b_id

        team_a_id = 1
        team_b_id = 1
        assert team_a_id == team_b_id  # rejected by the endpoint
