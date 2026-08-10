"""Unit tests for Web Push delivery, mocking pywebpush and the DB session."""

from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pywebpush import WebPushException

from app.services import push_service

pytestmark = pytest.mark.asyncio


def _subscription(endpoint: str = "https://push.example/abc") -> MagicMock:
    sub = MagicMock()
    sub.endpoint = endpoint
    sub.p256dh = "p256dh-key"
    sub.auth = "auth-key"
    return sub


@pytest.fixture(autouse=True)
def _vapid_configured() -> Iterator[None]:
    with (
        patch("app.core.config.settings.VAPID_PRIVATE_KEY", "priv"),
        patch("app.core.config.settings.VAPID_PUBLIC_KEY", "pub"),
    ):
        yield


class TestSendToUser:
    async def test_no_op_when_vapid_not_configured(self) -> None:
        with (
            patch("app.core.config.settings.VAPID_PRIVATE_KEY", None),
            patch("app.core.config.settings.VAPID_PUBLIC_KEY", None),
            patch("app.services.push_service.crud") as mock_crud,
        ):
            await push_service.send_to_user(MagicMock(), user_id=1, title="t", body="b")
            mock_crud.push_subscription.get_by_user.assert_not_called()

    async def test_no_op_when_user_has_no_subscriptions(self) -> None:
        with patch("app.services.push_service.crud") as mock_crud:
            mock_crud.push_subscription.get_by_user = AsyncMock(return_value=[])
            db = MagicMock()
            await push_service.send_to_user(db, user_id=1, title="t", body="b")
            mock_crud.push_subscription.remove_by_endpoint.assert_not_called()

    async def test_sends_to_every_subscription_for_the_user(self) -> None:
        subs = [_subscription("a"), _subscription("b")]
        with (
            patch("app.services.push_service.crud") as mock_crud,
            patch("app.services.push_service.webpush") as mock_webpush,
        ):
            mock_crud.push_subscription.get_by_user = AsyncMock(return_value=subs)
            db = MagicMock()
            await push_service.send_to_user(db, user_id=1, title="Olá", body="Corpo", url="/x")

            assert mock_webpush.call_count == 2
            mock_crud.push_subscription.remove_by_endpoint.assert_not_called()

    async def test_prunes_dead_subscriptions_on_410(self) -> None:
        subs = [_subscription("dead")]
        exc = WebPushException("gone")
        exc.response = MagicMock(status_code=410)
        with (
            patch("app.services.push_service.crud") as mock_crud,
            patch("app.services.push_service.webpush", side_effect=exc),
        ):
            mock_crud.push_subscription.get_by_user = AsyncMock(return_value=subs)
            mock_crud.push_subscription.remove_by_endpoint = AsyncMock()
            db = MagicMock()
            await push_service.send_to_user(db, user_id=1, title="t", body="b")

            mock_crud.push_subscription.remove_by_endpoint.assert_awaited_once_with(
                db, endpoint="dead"
            )

    async def test_keeps_subscription_on_non_dead_failure(self) -> None:
        subs = [_subscription("flaky")]
        exc = WebPushException("server error")
        exc.response = MagicMock(status_code=500)
        with (
            patch("app.services.push_service.crud") as mock_crud,
            patch("app.services.push_service.webpush", side_effect=exc),
        ):
            mock_crud.push_subscription.get_by_user = AsyncMock(return_value=subs)
            mock_crud.push_subscription.remove_by_endpoint = AsyncMock()
            db = MagicMock()
            await push_service.send_to_user(db, user_id=1, title="t", body="b")

            mock_crud.push_subscription.remove_by_endpoint.assert_not_called()


class TestSendToAll:
    async def test_no_op_when_vapid_not_configured(self) -> None:
        with (
            patch("app.core.config.settings.VAPID_PRIVATE_KEY", None),
            patch("app.core.config.settings.VAPID_PUBLIC_KEY", None),
            patch("app.services.push_service.crud") as mock_crud,
        ):
            sent = await push_service.send_to_all(MagicMock(), title="t", body="b")
            assert sent == 0
            mock_crud.push_subscription.get_all.assert_not_called()

    async def test_returns_zero_when_nobody_subscribed(self) -> None:
        with patch("app.services.push_service.crud") as mock_crud:
            mock_crud.push_subscription.get_all = AsyncMock(return_value=[])
            sent = await push_service.send_to_all(MagicMock(), title="t", body="b")
            assert sent == 0

    async def test_broadcasts_to_every_subscription_and_counts_successes(self) -> None:
        subs = [_subscription("a"), _subscription("b"), _subscription("c")]
        with (
            patch("app.services.push_service.crud") as mock_crud,
            patch("app.services.push_service.webpush") as mock_webpush,
        ):
            mock_crud.push_subscription.get_all = AsyncMock(return_value=subs)
            sent = await push_service.send_to_all(MagicMock(), title="Aviso", body="Chuva")

            assert sent == 3
            assert mock_webpush.call_count == 3

    async def test_dead_subscriptions_are_pruned_and_not_counted_as_sent(self) -> None:
        exc = WebPushException("gone")
        exc.response = MagicMock(status_code=404)
        subs = [_subscription("ok"), _subscription("dead")]

        def _webpush_side_effect(
            *, subscription_info: dict[str, object], **_kwargs: object
        ) -> None:
            if subscription_info["endpoint"] == "dead":
                raise exc

        db = MagicMock()
        with patch("app.services.push_service.crud") as mock_crud:
            mock_crud.push_subscription.get_all = AsyncMock(return_value=subs)
            mock_crud.push_subscription.remove_by_endpoint = AsyncMock()
            with patch("app.services.push_service.webpush", side_effect=_webpush_side_effect):
                sent = await push_service.send_to_all(db, title="t", body="b")

            assert sent == 1
            mock_crud.push_subscription.remove_by_endpoint.assert_awaited_once_with(
                db, endpoint="dead"
            )
