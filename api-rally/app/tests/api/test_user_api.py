"""API tests for `app/api/api_v1/user.py` (staff/guide assignment endpoints,
`/me`), against real Postgres. `authentik_client.list_group_members` stays
mocked — external I/O, out of scope.
"""

from unittest.mock import AsyncMock, patch

from sqlalchemy.exc import SQLAlchemyError

from app.api.authentik_client import AuthentikUser
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_user import user as crud_user
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.user import UserCreate
from app.tests.conftest import make_event as _make_event
from app.tests.conftest import make_team as _make_team


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order), commit=True
    )


async def _make_staff_user(pg_session, name="Staff1", email=None):
    user = await crud_user.create(pg_session, obj_in=UserCreate(name=name, email=email))
    user.scopes = ["rally-staff"]
    pg_session.add(user)
    await pg_session.commit()
    await pg_session.refresh(user)
    return user


async def _make_guide_user(pg_session, name="Guide1", email=None):
    user = await crud_user.create(pg_session, obj_in=UserCreate(name=name, email=email))
    user.scopes = ["rally-guide"]
    pg_session.add(user)
    await pg_session.commit()
    await pg_session.refresh(user)
    return user


def _mock_no_group_members(monkeypatch):
    monkeypatch.setattr(
        "app.api.api_v1.user.authentik_client.list_group_members",
        AsyncMock(return_value=[]),
    )


class TestGetMe:
    async def test_get_me_returns_auth_data(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/me")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Test Admin"
        assert body["disabled"] is False


class TestStaffAssignments:
    async def test_get_staff_assignments_empty(self, pg_session, pg_client, as_admin, monkeypatch):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}

    async def test_get_staff_assignments_unassigned_user(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        staff = await _make_staff_user(pg_session)

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["user_id"] == staff.id
        assert body["items"][0]["checkpoint_id"] is None
        assert body["items"][0]["id"] == 0

    async def test_get_staff_assignments_with_checkpoint(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        staff = await _make_staff_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        assign_resp = pg_client.put(
            f"/api/rally/v1/user/{staff.id}/checkpoint-assignment",
            json={"checkpoint_id": checkpoint.id},
        )
        assert assign_resp.status_code == 200, assign_resp.text

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["checkpoint_id"] == checkpoint.id
        assert body["items"][0]["checkpoint_name"] == checkpoint.name

    async def test_get_staff_assignments_paginates(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """The candidate set (every rally-staff-scoped user) is unbounded
        over a deployment's life — page_size must actually cap what comes
        back, and total must still reflect everyone, not just this page."""
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        for i in range(5):
            await _make_staff_user(pg_session, name=f"Staff{i}", email=f"staff{i}@ua.pt")

        resp = pg_client.get("/api/rally/v1/user/staff-assignments?page=1&page_size=2")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 5
        assert body["page"] == 1
        assert body["page_size"] == 2
        assert len(body["items"]) == 2

        resp_page_2 = pg_client.get("/api/rally/v1/user/staff-assignments?page=2&page_size=2")
        body_page_2 = resp_page_2.json()
        assert len(body_page_2["items"]) == 2
        assert {i["user_id"] for i in body["items"]}.isdisjoint(
            {i["user_id"] for i in body_page_2["items"]}
        )

    async def test_get_staff_assignments_searches_by_name_or_email(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """`q` finds one person directly instead of paging through
        everyone — the point of adding search alongside pagination."""
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        target = await _make_staff_user(pg_session, name="Ana Costa", email="ana.costa@ua.pt")
        await _make_staff_user(pg_session, name="Bruno Silva", email="bruno.silva@ua.pt")

        resp = pg_client.get("/api/rally/v1/user/staff-assignments?q=ana.costa")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["user_id"] == target.id

    async def test_update_checkpoint_assignment_removed(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        staff = await _make_staff_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        pg_client.put(
            f"/api/rally/v1/user/{staff.id}/checkpoint-assignment",
            json={"checkpoint_id": checkpoint.id},
        )

        resp = pg_client.put(
            f"/api/rally/v1/user/{staff.id}/checkpoint-assignment",
            json={"checkpoint_id": None},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == 0
        assert body["checkpoint_id"] is None

    async def test_get_staff_assignments_mirrors_group_members(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """A group member returned by Authentik that isn't yet mirrored
        locally gets created on the fly (covers the mirror-on-read loop)."""
        monkeypatch.setattr(
            "app.api.api_v1.user.authentik_client.list_group_members",
            AsyncMock(
                return_value=[
                    AuthentikUser(
                        authentik_sub="sub-new-staff",
                        name="New Staffer",
                        username="newstaffer",
                        email="newstaffer@example.com",
                    )
                ]
            ),
        )
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert any(u["user_name"] == "New Staffer" for u in body["items"])

    async def test_update_checkpoint_assignment_db_error_returns_400(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        staff = await _make_staff_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        with patch(
            "app.api.api_v1.user.crud.rally_staff_assignment.create_or_update",
            new=AsyncMock(side_effect=SQLAlchemyError("db down")),
        ):
            resp = pg_client.put(
                f"/api/rally/v1/user/{staff.id}/checkpoint-assignment",
                json={"checkpoint_id": checkpoint.id},
            )

        assert resp.status_code == 400, resp.text


class TestGuideAssignments:
    async def test_get_guide_assignments_empty(self, pg_session, pg_client, as_admin, monkeypatch):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}

    async def test_get_guide_assignments_unassigned_user(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["user_id"] == guide.id
        assert body["items"][0]["team_id"] is None

    async def test_get_guide_assignments_with_team(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        team = await _make_team(pg_session)

        assign_resp = pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-team-assignment",
            json={"team_id": team.id},
        )
        assert assign_resp.status_code == 200, assign_resp.text

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["team_id"] == team.id
        assert body["items"][0]["team_name"] == team.name

    async def test_get_guide_assignments_paginates(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """Same unbounded-candidate-set fix as staff assignments."""
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        for i in range(5):
            await _make_guide_user(pg_session, name=f"Guide{i}", email=f"guide{i}@ua.pt")

        resp = pg_client.get("/api/rally/v1/user/guide-assignments?page=1&page_size=2")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 5
        assert len(body["items"]) == 2

    async def test_get_guide_assignments_searches_by_name_or_email(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        target = await _make_guide_user(pg_session, name="Rui Pinto", email="rui.pinto@ua.pt")
        await _make_guide_user(pg_session, name="Sara Neves", email="sara.neves@ua.pt")

        resp = pg_client.get("/api/rally/v1/user/guide-assignments?q=Rui")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["user_id"] == target.id

    async def test_update_guide_team_assignment_removed(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        team = await _make_team(pg_session)

        pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-team-assignment",
            json={"team_id": team.id},
        )

        resp = pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-team-assignment",
            json={"team_id": None},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == 0
        assert body["team_id"] is None

    async def test_update_guide_team_assignment_records_audit_entry(
        self, pg_session, pg_client, as_admin
    ):
        """M15: guide-assignment changes used to leave no audit trail, unlike
        the equivalent staff-assignment endpoint."""
        from sqlalchemy import select

        from app.models.audit_log import AuditLog

        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        team = await _make_team(pg_session)

        resp = pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-team-assignment",
            json={"team_id": team.id},
        )
        assert resp.status_code == 200, resp.text

        rows = (
            (
                await pg_session.execute(
                    select(AuditLog).where(AuditLog.action == "guide_assignment.updated")
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].target_id == str(guide.id)
        assert rows[0].changes["team_id"]["after"] == team.id

    async def test_get_guide_assignments_mirrors_group_members(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        monkeypatch.setattr(
            "app.api.api_v1.user.authentik_client.list_group_members",
            AsyncMock(
                return_value=[
                    AuthentikUser(
                        authentik_sub="sub-new-guide",
                        name="New Guide",
                        username="newguide",
                        email="newguide@example.com",
                    )
                ]
            ),
        )
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert any(u["user_name"] == "New Guide" for u in body["items"])

    async def test_get_guide_assignments_drops_user_removed_from_group(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        """A user removed from the Authentik guide group must stop showing
        up here even if they never log back in to trigger `_sync_scopes`."""
        await _make_event(pg_session)
        stale_guide = await _make_guide_user(pg_session, email="stale@example.com")
        team = await _make_team(pg_session)
        pg_client.put(
            f"/api/rally/v1/user/{stale_guide.id}/guide-team-assignment",
            json={"team_id": team.id},
        )

        monkeypatch.setattr(
            "app.api.api_v1.user.authentik_client.list_group_members",
            AsyncMock(
                return_value=[
                    AuthentikUser(
                        authentik_sub="sub-current-guide",
                        name="Current Guide",
                        username="currentguide",
                        email="current@example.com",
                    )
                ]
            ),
        )

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert all(u["user_id"] != stale_guide.id for u in body["items"])
        assert any(u["user_name"] == "Current Guide" for u in body["items"])

        await pg_session.refresh(stale_guide)
        assert "rally-guide" not in stale_guide.scopes

    async def test_update_guide_team_assignment_db_error_returns_400(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        team = await _make_team(pg_session)

        with patch(
            "app.api.api_v1.user.crud.rally_guide_assignment.create_or_update",
            new=AsyncMock(side_effect=SQLAlchemyError("db down")),
        ):
            resp = pg_client.put(
                f"/api/rally/v1/user/{guide.id}/guide-team-assignment",
                json={"team_id": team.id},
            )

        assert resp.status_code == 400, resp.text
