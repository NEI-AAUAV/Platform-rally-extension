"""API tests for `app/api/api_v1/user.py` (staff/guide assignment endpoints,
`/me`), against real Postgres. `authentik_client.list_group_members` stays
mocked — external I/O, out of scope.
"""
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.api.authentik_client import AuthentikUser
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_user import user as crud_user
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.user import UserCreate


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_staff_user(pg_session, name="Staff1"):
    user = await crud_user.create(pg_session, obj_in=UserCreate(name=name))
    user.scopes = ["rally-staff"]
    pg_session.add(user)
    await pg_session.commit()
    await pg_session.refresh(user)
    return user


async def _make_guide_user(pg_session, name="Guide1"):
    user = await crud_user.create(pg_session, obj_in=UserCreate(name=name))
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
    async def test_get_staff_assignments_empty(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    async def test_get_staff_assignments_unassigned_user(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        staff = await _make_staff_user(pg_session)

        resp = pg_client.get("/api/rally/v1/user/staff-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["user_id"] == staff.id
        assert body[0]["checkpoint_id"] is None
        assert body[0]["id"] == 0

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
        assert len(body) == 1
        assert body[0]["checkpoint_id"] == checkpoint.id
        assert body[0]["checkpoint_name"] == checkpoint.name

    async def test_update_checkpoint_assignment_removed(
        self, pg_session, pg_client, as_admin
    ):
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
        assert any(u["user_name"] == "New Staffer" for u in body)

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
    async def test_get_guide_assignments_empty(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    async def test_get_guide_assignments_unassigned_user(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["user_id"] == guide.id
        assert body[0]["checkpoint_id"] is None

    async def test_get_guide_assignments_with_checkpoint(
        self, pg_session, pg_client, as_admin, monkeypatch
    ):
        _mock_no_group_members(monkeypatch)
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        assign_resp = pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-checkpoint-assignment",
            json={"checkpoint_id": checkpoint.id},
        )
        assert assign_resp.status_code == 200, assign_resp.text

        resp = pg_client.get("/api/rally/v1/user/guide-assignments")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["checkpoint_id"] == checkpoint.id

    async def test_update_guide_checkpoint_assignment_removed(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-checkpoint-assignment",
            json={"checkpoint_id": checkpoint.id},
        )

        resp = pg_client.put(
            f"/api/rally/v1/user/{guide.id}/guide-checkpoint-assignment",
            json={"checkpoint_id": None},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == 0
        assert body["checkpoint_id"] is None

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
        assert any(u["user_name"] == "New Guide" for u in body)

    async def test_update_guide_checkpoint_assignment_db_error_returns_400(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        guide = await _make_guide_user(pg_session)
        checkpoint = await _make_checkpoint(pg_session)

        with patch(
            "app.api.api_v1.user.crud.rally_guide_assignment.create_or_update",
            new=AsyncMock(side_effect=SQLAlchemyError("db down")),
        ):
            resp = pg_client.put(
                f"/api/rally/v1/user/{guide.id}/guide-checkpoint-assignment",
                json={"checkpoint_id": checkpoint.id},
            )

        assert resp.status_code == 400, resp.text
