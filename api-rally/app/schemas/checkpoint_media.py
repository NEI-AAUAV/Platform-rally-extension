import re

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.checkpoint_media import MediaKind

# Only the canonical Spotify web-player domain — this is what the embed
# iframe consumes (open.spotify.com/embed/...), so anything else (short
# links, spotify.com without "open", a lookalike domain) is rejected rather
# than trusted to resolve into something safe to embed later.
SPOTIFY_URL_PATTERN = re.compile(r"^https://open\.spotify\.com/")

# `link` accepts any http(s) URL — validated with a plain scheme check
# rather than Pydantic's `AnyHttpUrl` type, since these fields arrive as
# plain multipart Form() strings (not JSON body fields FastAPI can coerce
# on the way in), and a manually-constructed schema in handler code doesn't
# get FastAPI's automatic body-validation-to-422 conversion either way — the
# handler already wraps construction in a try/except ValidationError/ValueError.
HTTP_URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)

QR_CONTENT_MAX_LENGTH = 2000  # practical payload ceiling for a scannable level-H QR

# Which of the kind-specific fields each MediaKind is allowed to carry.
# Anything a kind doesn't list here is rejected outright rather than
# silently dropped — an admin who fills in the wrong field would otherwise
# have no way to notice it was discarded.
_ALLOWED_FIELDS_BY_KIND: dict[MediaKind, frozenset[str]] = {
    MediaKind.photo: frozenset(),
    MediaKind.fun_fact: frozenset(),
    MediaKind.qr: frozenset({"content_text"}),
    MediaKind.spotify: frozenset({"content_url", "title"}),
    MediaKind.link: frozenset({"content_url", "title"}),
}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _reject_fields_not_allowed_for_kind(
    *, kind: MediaKind, content_url: str | None, content_text: str | None, title: str | None
) -> None:
    """Reject any kind-specific field a `kind` isn't allowed to carry.

    Shared by create (full validation) and update (rejection only — a
    partial update must not re-demand presence of fields it isn't touching).
    """
    allowed = _ALLOWED_FIELDS_BY_KIND[kind]
    if content_url is not None and "content_url" not in allowed:
        raise ValueError(f"{kind.value} media does not use content_url")
    if content_text is not None and "content_text" not in allowed:
        raise ValueError(f"{kind.value} media does not use content_text")
    if title is not None and "title" not in allowed:
        raise ValueError(f"{kind.value} media does not use title")


def _validate_required_fields_for_kind(
    *, kind: MediaKind, caption: str | None, content_url: str | None, content_text: str | None
) -> None:
    """Full presence/shape validation for a brand-new row (create only)."""
    if kind == MediaKind.qr:
        _require(bool(content_text and content_text.strip()), "QR code requires content_text")
        _require(
            len(content_text or "") <= QR_CONTENT_MAX_LENGTH,
            f"QR content_text must be at most {QR_CONTENT_MAX_LENGTH} characters",
        )
    elif kind == MediaKind.spotify:
        _require(bool(content_url), "Spotify media requires content_url")
        _require(
            bool(content_url and SPOTIFY_URL_PATTERN.match(content_url)),
            "Spotify content_url must be an open.spotify.com link",
        )
    elif kind == MediaKind.link:
        _require(bool(content_url), "Link media requires content_url")
        _require(
            bool(content_url and HTTP_URL_PATTERN.match(content_url)),
            "Link content_url must be an http(s) URL",
        )
    elif kind == MediaKind.fun_fact:
        _require(bool(caption and caption.strip()), "Fun fact requires a caption")


class CheckpointMediaBase(BaseModel):
    kind: MediaKind
    caption: str | None = None
    order: int = 0
    title: str | None = None
    content_url: str | None = None
    content_text: str | None = None


class CheckpointMediaCreate(CheckpointMediaBase):
    @model_validator(mode="after")
    def _validate_kind_shape(self) -> "CheckpointMediaCreate":
        _reject_fields_not_allowed_for_kind(
            kind=self.kind,
            content_url=self.content_url,
            content_text=self.content_text,
            title=self.title,
        )
        _validate_required_fields_for_kind(
            kind=self.kind,
            caption=self.caption,
            content_url=self.content_url,
            content_text=self.content_text,
        )
        return self


class CheckpointMediaUpdate(BaseModel):
    """No `kind` here — a row's kind never changes after creation. Rejection
    of fields that don't belong to the row's existing kind happens in the
    CRUD layer (`validate_update_against_kind`), which knows that kind;
    this schema only shapes the incoming payload.
    """

    caption: str | None = None
    order: int | None = None
    title: str | None = None
    content_url: str | None = None
    content_text: str | None = None


def validate_update_against_kind(update: CheckpointMediaUpdate, *, kind: MediaKind) -> None:
    """Reject an update that sets a field the row's kind doesn't use.

    Called from the CRUD layer, which is the only place that knows the
    row's persisted `kind` (the update payload itself never carries one).
    """
    _reject_fields_not_allowed_for_kind(
        kind=kind,
        content_url=update.content_url,
        content_text=update.content_text,
        title=update.title,
    )


class CheckpointMediaResponse(CheckpointMediaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkpoint_id: int
    image_url: str | None = None
