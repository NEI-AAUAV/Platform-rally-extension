"""Optional error tracking (Sentry / GlitchTip).

Initialisation is fully gated on ``SENTRY_DSN``: with no DSN — the default in
dev and CI — nothing is imported or sent, so the app and tests run without the
SDK installed. Sensitive request headers are scrubbed before any event leaves
the process.
"""

import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Request headers that must never reach the error tracker.
_SENSITIVE_HEADERS = frozenset({"authorization", "cookie", "x-request-id"})


def _scrub_sensitive(event: dict[str, Any], _hint: dict[str, Any]) -> Optional[dict[str, Any]]:
    """before_send hook: drop credential-bearing request headers."""
    headers = event.get("request", {}).get("headers")
    if isinstance(headers, dict):
        for key in list(headers):
            if key.lower() in _SENSITIVE_HEADERS:
                headers[key] = "[scrubbed]"
    return event


def init_sentry() -> None:
    """Initialise Sentry when a DSN is configured; otherwise a no-op."""
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk is not installed; skipping")
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        # Sentry types before_send as (Event, Hint) -> Event | None; Event is a
        # TypedDict, so our dict-based scrubber is runtime-correct here.
        before_send=_scrub_sensitive,  # type: ignore[arg-type]
    )
    logger.info("Sentry initialised for environment=%s", settings.ENV)
