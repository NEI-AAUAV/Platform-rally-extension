"""End-to-end API tests: the real FastAPI app against a real Postgres schema.

Only the OIDC identity layer is faked (dependency override); everything else
— routing, dependencies, CRUD, SQL, constraints — runs for real. Covers the
core team journey (login → verify → GPS arrival → auto-advance) and the guide
surface (role gate + indications).
"""

import asyncio
from collections.abc import Iterator
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.auth import api_nei_auth
from app.core.config import settings as app_settings
from app.main import app
from app.models.activity import EventType, RallyEvent
from app.models.base import Base
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.user import DetailedUser

SCHEMA = app_settings.SCHEMA_NAME


def _async_test_url() -> str:
    return str(app_settings.TEST_POSTGRES_URI).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


async def _create_schema_and_seed() -> None:
    engine = create_async_engine(_async_test_url(), poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
            await conn.exec_driver_sql(f'CREATE SCHEMA "{SCHEMA}"')
            await conn.run_sync(Base.metadata.create_all)

        maker = async_sessionmaker(engine, expire_on_commit=False)
        # Seed a peddy-paper edition with two checkpoints and one team.
        async with maker() as session:
            event = RallyEvent(
                name="Peddy",
                event_type=EventType.PEDDY_PAPER.value,
                is_current=True,
            )
            session.add(event)
            await session.commit()
            await session.refresh(event)

            session.add_all(
                [
                    RallySettings(event_id=event.id, checkpoint_order_matters=True),
                    CheckPoint(
                        name="CP1",
                        order=1,
                        event_id=event.id,
                        latitude=40.0,
                        longitude=-8.0,
                        arrival_radius_m=50,
                    ),
                    CheckPoint(
                        name="CP2",
                        order=2,
                        event_id=event.id,
                        latitude=41.0,
                        longitude=-8.5,
                        arrival_radius_m=50,
                    ),
                    Team(name="Equipa E2E", access_code="EEEE-2222", event_id=event.id),
                ]
            )
            await session.commit()
    finally:
        await engine.dispose()


async def _drop_schema() -> None:
    engine = create_async_engine(_async_test_url(), poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
    finally:
        await engine.dispose()


@pytest.fixture(scope="module")
def e2e_client() -> Iterator[TestClient]:
    """TestClient whose get_db yields sessions on a fresh Postgres schema.

    Module-scoped: the app's lifespan and its globals bind to the first
    client's event loop, so one client (and one seeded schema) serves the
    whole module. The engine is pool-less (NullPool) so no asyncpg connection
    outlives the loop it was created on.
    """
    try:
        asyncio.run(_create_schema_and_seed())
    except (SQLAlchemyError, OSError) as exc:
        pytest.skip(f"Postgres not available for integration tests: {exc}")

    engine = create_async_engine(_async_test_url(), poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with maker() as session:
            yield session

    app.dependency_overrides[deps.get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        asyncio.run(_drop_schema())


def _login(client: TestClient, code: str = "EEEE-2222") -> str:
    resp = client.post("/api/rally/v1/team-auth/login", json={"access_code": code})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_team_journey_login_verify_arrive_and_advance(e2e_client: TestClient) -> None:
    token = _login(e2e_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Verify round-trips the team identity.
    verify = e2e_client.get("/api/rally/v1/team-auth/verify", headers=headers)
    assert verify.status_code == 200
    assert verify.json()["team_name"] == "Equipa E2E"

    # Wrong access code stays out.
    bad = e2e_client.post(
        "/api/rally/v1/team-auth/login", json={"access_code": "XXXX-0000"}
    )
    assert bad.status_code == 401

    # GPS arrival at CP1 (exactly at the coordinates): recorded and, since the
    # post has no activities, the team auto-advances past it.
    arrive = e2e_client.post(
        "/api/rally/v1/checkpoint/1/arrive",
        json={"latitude": 40.0, "longitude": -8.0},
        headers=headers,
    )
    assert arrive.status_code == 200, arrive.text
    body = arrive.json()
    assert body["already_registered"] is False
    assert body["auto_completed"] is True

    # Re-arriving is idempotent.
    again = e2e_client.post(
        "/api/rally/v1/checkpoint/1/arrive",
        json={"latitude": 40.0001, "longitude": -8.0001},
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["already_registered"] is True

    # Too far from CP2 → rejected with the distance in the error.
    far = e2e_client.post(
        "/api/rally/v1/checkpoint/2/arrive",
        json={"latitude": 40.0, "longitude": -8.0},
        headers=headers,
    )
    assert far.status_code == 400
    assert "Too far" in far.json()["detail"]


def test_arrive_requires_team_token(e2e_client: TestClient) -> None:
    resp = e2e_client.post(
        "/api/rally/v1/checkpoint/1/arrive",
        json={"latitude": 40.0, "longitude": -8.0},
    )
    assert resp.status_code in (401, 403)


def _fake_oidc_user(scopes: list[str]):
    auth = Mock()
    auth.oidc_sub = "e2e-sub"
    auth.email = "e2e@ua.pt"
    auth.name = "E2E User"
    auth.scopes = scopes
    return auth


def test_guide_surface_role_gate_and_indications(e2e_client: TestClient) -> None:
    # Seed an indication directly.
    import asyncio

    async def seed():
        engine = create_async_engine(_async_test_url())
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as session:
            session.add(
                CheckpointGuideIndication(
                    checkpoint_id=1,
                    hint="Fala da fonte",
                    question="Ano?",
                    expected_answer="1450",
                    order=0,
                )
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(seed())

    # Anonymous: both guide endpoints refuse.
    anon_cp = e2e_client.get("/api/rally/v1/guide/checkpoints")
    assert anon_cp.status_code in (401, 403)
    anon_ind = e2e_client.get("/api/rally/v1/checkpoint/1/guide-indications")
    assert anon_ind.status_code in (401, 403)

    # Guide role: full view, peddy paper implies guide mode.
    app.dependency_overrides[api_nei_auth] = lambda: _fake_oidc_user(["rally-guide"])
    try:
        cps = e2e_client.get("/api/rally/v1/guide/checkpoints")
        assert cps.status_code == 200, cps.text
        data = cps.json()
        assert [cp["name"] for cp in data] == ["CP1", "CP2"]
        assert data[0]["indications"][0]["expected_answer"] == "1450"

        inds = e2e_client.get("/api/rally/v1/checkpoint/1/guide-indications")
        assert inds.status_code == 200
        assert inds.json()[0]["hint"] == "Fala da fonte"

        # Guides cannot manage indications (admin-only).
        forbidden = e2e_client.post(
            "/api/rally/v1/checkpoint/1/guide-indications",
            json={"hint": "novo", "order": 1},
        )
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.pop(api_nei_auth, None)


def test_team_listing_reachable_for_public_leaderboard(e2e_client: TestClient) -> None:
    teams = e2e_client.get("/api/rally/v1/team/")
    assert teams.status_code == 200
    assert [t["name"] for t in teams.json()] == ["Equipa E2E"]
