"""Unit tests for the R2 storage client (app.services.storage)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.storage import StorageClient


def _settings(**overrides: object) -> SimpleNamespace:
    base = {
        "R2_ENDPOINT_URL": "https://r2.example.com",
        "R2_ACCESS_KEY_ID": "key-id",
        "R2_SECRET_ACCESS_KEY": "secret",
        "R2_BUCKET": "bucket",
        "R2_PUBLIC_BASE_URL": "https://cdn.example.com",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestStorageClientInit:
    def test_disabled_when_config_missing(self) -> None:
        with patch(
            "app.services.storage.get_settings",
            return_value=_settings(R2_ENDPOINT_URL=None),
        ):
            client = StorageClient()

        assert client.enabled is False
        assert client.client is None
        assert client.bucket is None
        assert client.public_base_url is None

    def test_enabled_when_fully_configured(self) -> None:
        with (
            patch("app.services.storage.get_settings", return_value=_settings()),
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            mock_boto.return_value = MagicMock()
            client = StorageClient()

        assert client.enabled is True
        assert client.client is mock_boto.return_value
        assert client.bucket == "bucket"
        assert client.public_base_url == "https://cdn.example.com"

    def test_disabled_when_boto_init_raises(self) -> None:
        with (
            patch("app.services.storage.get_settings", return_value=_settings()),
            patch("app.services.storage.boto3.client", side_effect=RuntimeError("boom")),
        ):
            client = StorageClient()

        assert client.enabled is False
        assert client.client is None
        assert client.bucket is None
        assert client.public_base_url is None


class TestUploadImage:
    def _disabled_client(self) -> StorageClient:
        with patch(
            "app.services.storage.get_settings",
            return_value=_settings(R2_ENDPOINT_URL=None),
        ):
            return StorageClient()

    def _enabled_client(self) -> StorageClient:
        with (
            patch("app.services.storage.get_settings", return_value=_settings()),
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            mock_boto.return_value = MagicMock()
            return StorageClient()

    def test_upload_returns_none_when_disabled(self) -> None:
        client = self._disabled_client()
        assert client.upload_image("key.png", b"data", "image/png") is None

    def test_upload_success_returns_public_url(self) -> None:
        client = self._enabled_client()
        url = client.upload_image("teams/1/photo.png", b"data", "image/png")

        assert url == "https://cdn.example.com/teams/1/photo.png"
        client.client.put_object.assert_called_once_with(
            Bucket="bucket",
            Key="teams/1/photo.png",
            Body=b"data",
            ContentType="image/png",
            ACL="public-read",
        )

    def test_upload_returns_none_on_client_error(self) -> None:
        client = self._enabled_client()
        client.client.put_object.side_effect = RuntimeError("network error")

        assert client.upload_image("key.png", b"data", "image/png") is None


class TestDeleteImage:
    def _disabled_client(self) -> StorageClient:
        with patch(
            "app.services.storage.get_settings",
            return_value=_settings(R2_ENDPOINT_URL=None),
        ):
            return StorageClient()

    def _enabled_client(self) -> StorageClient:
        with (
            patch("app.services.storage.get_settings", return_value=_settings()),
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            mock_boto.return_value = MagicMock()
            return StorageClient()

    def test_delete_returns_true_when_disabled(self) -> None:
        client = self._disabled_client()
        assert client.delete_image("https://cdn.example.com/x.png") is True

    def test_delete_returns_true_when_url_is_none(self) -> None:
        client = self._enabled_client()
        assert client.delete_image(None) is True

    def test_delete_returns_true_when_url_not_from_r2(self) -> None:
        client = self._enabled_client()
        assert client.delete_image("https://other-cdn.com/x.png") is True

    def test_delete_success_calls_delete_object(self) -> None:
        client = self._enabled_client()
        result = client.delete_image("https://cdn.example.com/teams/1/photo.png")

        assert result is True
        client.client.delete_object.assert_called_once_with(
            Bucket="bucket", Key="teams/1/photo.png"
        )

    def test_delete_returns_false_on_client_error(self) -> None:
        client = self._enabled_client()
        client.client.delete_object.side_effect = RuntimeError("network error")

        result = client.delete_image("https://cdn.example.com/teams/1/photo.png")
        assert result is False
