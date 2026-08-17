"""API tests for the Web Push broadcast endpoints, against real Postgres."""

from unittest.mock import patch

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.checkpoint import CheckPointCreate


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

    async def test_returns_503_when_vapid_not_configured(self, pg_session, pg_client, as_admin):
        with (
            patch("app.core.config.settings.VAPID_PRIVATE_KEY", None),
            patch("app.core.config.settings.VAPID_PUBLIC_KEY", None),
        ):
            resp = pg_client.post(
                "/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"}
            )
        assert resp.status_code == 503

    async def test_sends_to_every_subscribed_device(self, pg_session, pg_client, as_admin):
        await _add_subscription(pg_session, user_id=10, endpoint="https://push.example/a")
        await _add_subscription(pg_session, user_id=20, endpoint="https://push.example/b")
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

    async def test_rejects_empty_title(self, pg_client, as_admin):
        resp = pg_client.post("/api/rally/v1/push/broadcast", json={"title": "", "body": "Corpo"})
        assert resp.status_code == 422

    def test_non_admin_current_user_cannot_broadcast(self, pg_client, as_user):
        resp = pg_client.post("/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"})
        assert resp.status_code in (401, 403)


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Posto {order}", order=order), commit=True
    )


class TestCheckpointAnnouncement:
    """Staff announcing about their own post — no admin dependency."""

    async def test_requires_staff_checkpoint_access(self, pg_client):
        resp = pg_client.post(
            "/api/rally/v1/push/checkpoint-announcement", json={"body": "Fila grande"}
        )
        assert resp.status_code in (401, 403)

    async def test_rejects_staff_without_checkpoint_assignment(
        self, pg_session, pg_client, as_staff
    ):
        as_staff.staff_checkpoint_id = None
        resp = pg_client.post(
            "/api/rally/v1/push/checkpoint-announcement", json={"body": "Fila grande"}
        )
        assert resp.status_code == 403

    async def test_stamps_the_staffer_own_checkpoint_name_and_sends_to_everyone(
        self, pg_session, pg_client, as_staff
    ):
        checkpoint = await _make_checkpoint(pg_session, order=3)
        await _add_subscription(pg_session, user_id=30, endpoint="https://push.example/c")
        as_staff.staff_checkpoint_id = checkpoint.id
        with (
            patch("app.core.config.settings.VAPID_PRIVATE_KEY", "priv"),
            patch("app.core.config.settings.VAPID_PUBLIC_KEY", "pub"),
            patch("app.services.push_service.webpush") as mock_webpush,
        ):
            resp = pg_client.post(
                "/api/rally/v1/push/checkpoint-announcement",
                json={"body": "Fila grande, contem 15 min"},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"sent": 1}
        assert mock_webpush.call_count == 1
        sent_payload = mock_webpush.call_args.kwargs["data"]
        assert checkpoint.name in sent_payload

    async def test_returns_503_when_vapid_not_configured(self, pg_session, pg_client, as_staff):
        checkpoint = await _make_checkpoint(pg_session, order=4)
        as_staff.staff_checkpoint_id = checkpoint.id
        with (
            patch("app.core.config.settings.VAPID_PRIVATE_KEY", None),
            patch("app.core.config.settings.VAPID_PUBLIC_KEY", None),
        ):
            resp = pg_client.post(
                "/api/rally/v1/push/checkpoint-announcement", json={"body": "Fila grande"}
            )
        assert resp.status_code == 503
