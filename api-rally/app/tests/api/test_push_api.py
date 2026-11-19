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


_SUB_BODY = {
    "endpoint": "https://push.example/team-device",
    "keys": {"p256dh": "p256dh", "auth": "auth"},
}


def _vapid_on():
    return (
        patch("app.core.config.settings.VAPID_PRIVATE_KEY", "priv"),
        patch("app.core.config.settings.VAPID_PUBLIC_KEY", "pub"),
    )


async def _subscription_rows(pg_session):
    from sqlalchemy import select

    pg_session.expire_all()
    return (await pg_session.scalars(select(PushSubscription))).all()


class TestSubscribe:
    """A device can subscribe from a staff/user session or a team session."""

    async def test_requires_some_session(self, pg_client):
        priv, pub = _vapid_on()
        with priv, pub:
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=_SUB_BODY)
        assert resp.status_code == 401

    async def test_team_session_subscribes_its_device(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        team_id = (await make_team(pg_session, name="Equipa Push")).id
        priv, pub = _vapid_on()
        with priv, pub, as_team(team_id):
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=_SUB_BODY)

        assert resp.status_code == 200, resp.text
        rows = await _subscription_rows(pg_session)
        assert [(r.team_id, r.user_id) for r in rows] == [(team_id, None)]

    async def test_staff_session_subscribes_as_user(self, pg_session, pg_client, as_staff):
        pg_session.add(User(id=as_staff.id, name="Test Staff", disabled=False))
        await pg_session.commit()
        priv, pub = _vapid_on()
        with priv, pub:
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=_SUB_BODY)

        assert resp.status_code == 200, resp.text
        rows = await _subscription_rows(pg_session)
        assert [(r.team_id, r.user_id) for r in rows] == [(None, as_staff.id)]

    async def test_same_device_switching_to_team_moves_ownership(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        await _add_subscription(pg_session, user_id=40, endpoint=_SUB_BODY["endpoint"])
        team_id = (await make_team(pg_session, name="Equipa Troca")).id
        priv, pub = _vapid_on()
        with priv, pub, as_team(team_id):
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=_SUB_BODY)

        assert resp.status_code == 200, resp.text
        rows = await _subscription_rows(pg_session)
        assert [(r.team_id, r.user_id) for r in rows] == [(team_id, None)]

    async def test_team_unsubscribes_its_own_device(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        team = await make_team(pg_session, name="Equipa Sai")
        pg_session.add(
            PushSubscription(team_id=team.id, endpoint=_SUB_BODY["endpoint"], p256dh="p", auth="a")
        )
        await pg_session.commit()
        with as_team(team.id):
            resp = pg_client.post(
                "/api/rally/v1/push/unsubscribe", json={"endpoint": _SUB_BODY["endpoint"]}
            )

        assert resp.status_code in (200, 204), resp.text
        assert await _subscription_rows(pg_session) == []

    async def test_team_cannot_unsubscribe_another_team_device(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        owner = await make_team(pg_session, name="Dona")
        other = await make_team(pg_session, name="Outra")
        pg_session.add(
            PushSubscription(team_id=owner.id, endpoint=_SUB_BODY["endpoint"], p256dh="p", auth="a")
        )
        await pg_session.commit()
        with as_team(other.id):
            pg_client.post(
                "/api/rally/v1/push/unsubscribe", json={"endpoint": _SUB_BODY["endpoint"]}
            )

        assert len(await _subscription_rows(pg_session)) == 1

    async def test_broadcast_reaches_team_devices(self, pg_session, pg_client, as_admin):
        from app.tests.conftest import make_team

        team = await make_team(pg_session, name="Equipa Recebe")
        pg_session.add(
            PushSubscription(
                team_id=team.id, endpoint="https://push.example/t", p256dh="p", auth="a"
            )
        )
        await pg_session.commit()
        await _add_subscription(pg_session, user_id=50, endpoint="https://push.example/u")
        priv, pub = _vapid_on()
        with priv, pub, patch("app.services.push_service.webpush") as mock_webpush:
            resp = pg_client.post(
                "/api/rally/v1/push/broadcast", json={"title": "Oi", "body": "Corpo"}
            )

        assert resp.json() == {"sent": 2}
        assert mock_webpush.call_count == 2


class TestSubscribeOwnershipGuard:
    """Knowing another device's endpoint must not let a session take it over."""

    async def test_other_owner_with_different_keys_is_rejected(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        await _add_subscription(pg_session, user_id=60, endpoint=_SUB_BODY["endpoint"])
        team_id = (await make_team(pg_session, name="Intrusa")).id
        hijack = {**_SUB_BODY, "keys": {"p256dh": "attacker", "auth": "attacker"}}
        priv, pub = _vapid_on()
        with priv, pub, as_team(team_id):
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=hijack)

        assert resp.status_code == 409
        rows = await _subscription_rows(pg_session)
        assert [(r.user_id, r.team_id, r.p256dh) for r in rows] == [(60, None, "p256dh")]

    async def test_same_owner_can_refresh_keys(self, pg_session, pg_client):
        from app.tests.conftest import as_team, make_team

        team_id = (await make_team(pg_session, name="Refresca")).id
        pg_session.add(
            PushSubscription(
                team_id=team_id, endpoint=_SUB_BODY["endpoint"], p256dh="old", auth="old"
            )
        )
        await pg_session.commit()
        priv, pub = _vapid_on()
        with priv, pub, as_team(team_id):
            resp = pg_client.post("/api/rally/v1/push/subscribe", json=_SUB_BODY)

        assert resp.status_code == 200, resp.text
        rows = await _subscription_rows(pg_session)
        assert [(r.team_id, r.p256dh) for r in rows] == [(team_id, "p256dh")]


class TestSubscribeWithRealTeamToken:
    """No dependency overrides: a genuine team JWT must pass through the
    optional OIDC check (which rejects it) and resolve as the team."""

    async def test_team_jwt_subscribes_as_team(self, pg_session, pg_client):
        from app.services.team_auth_service import create_team_access_token
        from app.tests.conftest import make_event, make_team

        event = await make_event(pg_session, is_current=True)
        team = await make_team(pg_session, name="Equipa JWT", event_id=event.id)
        team_id, team_name, version, event_id = team.id, team.name, team.auth_version, event.id
        token = create_team_access_token(
            team_id=team_id, team_name=team_name, auth_version=version, event_id=event_id
        )
        priv, pub = _vapid_on()
        with priv, pub:
            resp = pg_client.post(
                "/api/rally/v1/push/subscribe",
                json=_SUB_BODY,
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200, resp.text
        rows = await _subscription_rows(pg_session)
        assert [(r.team_id, r.user_id) for r in rows] == [(team_id, None)]
