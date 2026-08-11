"""Unit tests for CheckpointMedia schema validators — pure, no DB needed."""

import pytest
from pydantic import ValidationError

from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint_media import (
    QR_CONTENT_MAX_LENGTH,
    CheckpointMediaCreate,
    CheckpointMediaUpdate,
    validate_update_against_kind,
)


class TestCheckpointMediaCreateValidation:
    def test_qr_requires_content_text(self) -> None:
        with pytest.raises(ValidationError, match="content_text"):
            CheckpointMediaCreate(kind=MediaKind.qr)

    def test_qr_rejects_content_text_over_max_length(self) -> None:
        with pytest.raises(ValidationError, match="2000"):
            CheckpointMediaCreate(kind=MediaKind.qr, content_text="x" * (QR_CONTENT_MAX_LENGTH + 1))

    def test_qr_accepts_content_text_at_max_length(self) -> None:
        media = CheckpointMediaCreate(kind=MediaKind.qr, content_text="x" * QR_CONTENT_MAX_LENGTH)
        assert media.content_text is not None
        assert len(media.content_text) == QR_CONTENT_MAX_LENGTH

    def test_qr_rejects_content_url(self) -> None:
        with pytest.raises(ValidationError, match="content_url"):
            CheckpointMediaCreate(
                kind=MediaKind.qr, content_text="payload", content_url="https://example.com"
            )

    @pytest.mark.parametrize(
        "url",
        [
            "https://open.spotify.com/track/abc123",
            "https://open.spotify.com/playlist/xyz",
        ],
    )
    def test_spotify_accepts_open_spotify_com(self, url: str) -> None:
        media = CheckpointMediaCreate(kind=MediaKind.spotify, content_url=url)
        assert media.content_url == url

    @pytest.mark.parametrize(
        "url",
        [
            "https://evil.com/spotify",
            "https://spotify.com/track/abc123",  # missing "open." subdomain
            "http://open.spotify.com/track/abc123",  # not https
        ],
    )
    def test_spotify_rejects_non_open_spotify_domain(self, url: str) -> None:
        with pytest.raises(ValidationError, match="open.spotify.com"):
            CheckpointMediaCreate(kind=MediaKind.spotify, content_url=url)

    def test_spotify_requires_content_url(self) -> None:
        with pytest.raises(ValidationError, match="content_url"):
            CheckpointMediaCreate(kind=MediaKind.spotify)

    def test_spotify_rejects_content_text(self) -> None:
        with pytest.raises(ValidationError, match="content_text"):
            CheckpointMediaCreate(
                kind=MediaKind.spotify,
                content_url="https://open.spotify.com/track/abc",
                content_text="not allowed",
            )

    def test_link_accepts_https_url(self) -> None:
        media = CheckpointMediaCreate(kind=MediaKind.link, content_url="https://example.com")
        assert media.content_url == "https://example.com"

    def test_link_accepts_http_url(self) -> None:
        media = CheckpointMediaCreate(kind=MediaKind.link, content_url="http://example.com")
        assert media.content_url == "http://example.com"

    def test_link_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValidationError, match="http"):
            CheckpointMediaCreate(kind=MediaKind.link, content_url="javascript:alert(1)")

    def test_link_requires_content_url(self) -> None:
        with pytest.raises(ValidationError, match="content_url"):
            CheckpointMediaCreate(kind=MediaKind.link)

    def test_fun_fact_requires_caption(self) -> None:
        with pytest.raises(ValidationError, match="caption"):
            CheckpointMediaCreate(kind=MediaKind.fun_fact)

    def test_fun_fact_accepts_caption(self) -> None:
        media = CheckpointMediaCreate(kind=MediaKind.fun_fact, caption="Did you know...")
        assert media.caption == "Did you know..."

    def test_photo_rejects_content_url(self) -> None:
        with pytest.raises(ValidationError, match="content_url"):
            CheckpointMediaCreate(kind=MediaKind.photo, content_url="https://example.com")

    def test_photo_rejects_content_text(self) -> None:
        with pytest.raises(ValidationError, match="content_text"):
            CheckpointMediaCreate(kind=MediaKind.photo, content_text="payload")

    def test_photo_and_fun_fact_reject_title(self) -> None:
        with pytest.raises(ValidationError, match="title"):
            CheckpointMediaCreate(kind=MediaKind.photo, title="Not allowed")


class TestValidateUpdateAgainstKind:
    def test_allows_matching_field(self) -> None:
        validate_update_against_kind(
            CheckpointMediaUpdate(content_text="new payload"), kind=MediaKind.qr
        )  # no raise

    def test_allows_partial_update_touching_nothing_kind_specific(self) -> None:
        validate_update_against_kind(CheckpointMediaUpdate(caption="new"), kind=MediaKind.qr)

    def test_rejects_mismatched_field(self) -> None:
        with pytest.raises(ValueError, match="content_url"):
            validate_update_against_kind(
                CheckpointMediaUpdate(content_url="https://example.com"), kind=MediaKind.qr
            )
