"""Cloudflare R2 object storage for branding image uploads.

Mirrors the gala/family extensions: a single module-level client that
no-ops gracefully when R2 is not configured (dev without credentials),
so the rally app stays runnable and falls back to bundled defaults.
"""
from typing import Any, Optional

import boto3
from botocore.config import Config
from loguru import logger

from app.core.config import get_settings


class StorageClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.enabled: bool = all([
            settings.R2_ENDPOINT_URL,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_BUCKET,
            settings.R2_PUBLIC_BASE_URL,
        ])
        self.client: Any = None
        self.bucket: Optional[str] = None
        self.public_base_url: Optional[str] = None

        if not self.enabled:
            return

        try:
            self.client = boto3.client(
                "s3",
                endpoint_url=settings.R2_ENDPOINT_URL,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                config=Config(
                    signature_version="s3v4",
                    connect_timeout=10,
                    read_timeout=30,
                ),
            )
            self.bucket = settings.R2_BUCKET
            self.public_base_url = settings.R2_PUBLIC_BASE_URL
        except Exception as e:
            logger.error("Failed to initialize R2 storage client: %s", e)
            self.enabled = False
            self.client = None
            self.bucket = None
            self.public_base_url = None

    def upload_image(self, key: str, data: bytes, content_type: str) -> Optional[str]:
        """Upload bytes to R2. Returns public URL, or None if disabled/failed."""
        if not self.enabled or self.public_base_url is None:
            logger.warning("R2 storage not configured; skipping upload")
            return None

        try:
            logger.info(f"Uploading to R2: {key} ({len(data)} bytes)")
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ACL="public-read",
            )
            url = f"{self.public_base_url.rstrip('/')}/{key}"
            logger.info(f"Successfully uploaded to R2: {url}")
            return url
        except Exception as e:
            logger.error(f"Failed to upload to R2: {e}")
            return None

    def delete_image(self, image_url: Optional[str]) -> bool:
        """Delete an image from R2 by URL.

        Returns True if deleted or the URL is not an R2 URL (nothing to do),
        False only on an actual delete error.
        """
        if not self.enabled or not image_url or self.public_base_url is None:
            return True

        r2_base = self.public_base_url.rstrip("/")
        if not image_url.startswith(r2_base):
            return True

        try:
            key = image_url[len(r2_base) + 1:]
            logger.info(f"Deleting image from R2: {key}")
            self.client.delete_object(Bucket=self.bucket, Key=key)
            logger.info(f"Successfully deleted from R2: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete image from R2: {e}")
            return False


storage_client = StorageClient()
