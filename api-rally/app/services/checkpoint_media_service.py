"""Business rules for checkpoint media: the shared upload-if-provided
pattern used by both create and update.
"""

from fastapi import UploadFile

from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store


class CheckpointMediaService:
    """Upload handling shared by the checkpoint-media create/update endpoints."""

    @staticmethod
    async def upload_image_if_provided(
        image: UploadFile | None, *, checkpoint_id: int
    ) -> str | None:
        """Store the image in R2 if one was actually attached.

        Returns None when no file was sent (multipart forms leave ``image``
        as an empty UploadFile rather than None, so ``image.filename`` is the
        real presence check).
        """
        if not image or not image.filename:
            return None
        return await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/checkpoints/{checkpoint_id}/media",
        )
