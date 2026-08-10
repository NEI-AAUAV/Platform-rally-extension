"""API tests for the Web Push broadcast endpoint, against real Postgres."""

from unittest.mock import patch

from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_admin, get_current_user
from app.main import app
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.user import DetailedUser


def _override_admin():
    admin = DetailedUser(id=1, name="Admin", disabled=False, scopes=["admin"])
    app.dependency_overrides[get_admin] = lambda: admin
    app.dependency_overrides[api_nei_auth] = lambda: AuthData(
        oidc_sub="admin1", name="Admin", scopes=["admin"]
    )
    return admin


def _pop_admin_overrides():
    app.dependency_overrides.pop(get_admin, None)
    app.dependency_overrides.pop(api_nei_auth, None)


async def _add_subscription(pg_session, *, user_id: int, endpoint: str) -> None:
    # Subscription rows FK to a real user, so seed one per subscriber first —
    # mirrors how a real subscribe request only ever runs for a logged-in
    # participant, never a synthetic user_id.
    pg_session.add(User(id=user_id, name=f"User {user_id}", disabled=False))
    await pg_session.flush()
    pg_session.add(
        PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="p256dh", auth="auth")
    )
    await pg_session.commit()


class TestBroadcast:
    def test_requires_admin(self, pg_client):
        resp = pg_client.post("/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"})
        assert resp.status_code in (401, 403)

    async def test_returns_503_when_vapid_not_configured(self, pg_session, pg_client):
        _override_admin()
        try:
            with (
                patch("app.core.config.settings.VAPID_PRIVATE_KEY", None),
                patch("app.core.config.settings.VAPID_PUBLIC_KEY", None),
            ):
                resp = pg_client.post(
                    "/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"}
                )
            assert resp.status_code == 503
        finally:
            _pop_admin_overrides()

    async def test_sends_to_every_subscribed_device(self, pg_session, pg_client):
        _override_admin()
        await _add_subscription(pg_session, user_id=10, endpoint="https://push.example/a")
        await _add_subscription(pg_session, user_id=20, endpoint="https://push.example/b")
        try:
            with (
                patch("app.core.config.settings.VAPID_PRIVATE_KEY", "priv"),
                patch("app.core.config.settings.VAPID_PUBLIC_KEY", "pub"),
                patch("app.services.push_service.webpush") as mock_webpush,
            ):
                resp = pg_client.post(
                    "/api/rally/v1/push/broadcast",
                    json={"title": "Chuva a chegar", "body": "Abrigem-se no posto mais próximo"},
                )

            assert resp.status_code == 200
            assert resp.json() == {"sent": 2}
            assert mock_webpush.call_count == 2
        finally:
            _pop_admin_overrides()

    async def test_rejects_empty_title(self, pg_client):
        _override_admin()
        try:
            resp = pg_client.post(
                "/api/rally/v1/push/broadcast", json={"title": "", "body": "Corpo"}
            )
            assert resp.status_code == 422
        finally:
            _pop_admin_overrides()

    def test_non_admin_current_user_cannot_broadcast(self, pg_client):
        participant = DetailedUser(id=2, name="Participant", disabled=False, scopes=[])
        app.dependency_overrides[get_current_user] = lambda: participant
        try:
            resp = pg_client.post(
                "/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"}
            )
            assert resp.status_code in (401, 403)
        finally:
            app.dependency_overrides.pop(get_current_user, None)
