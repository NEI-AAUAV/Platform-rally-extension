"""Optional error tracking (Sentry / GlitchTip).

Initialisation is fully gated on ``SENTRY_DSN``: with no DSN — the default in
dev and CI — nothing is imported or sent, so the app and tests run without the
SDK installed. Sensitive request headers are scrubbed before any event leaves
the process.
"""

import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Request headers that must never reach the error tracker. x-request-id is
# NOT here — it is a correlation ID, not a credential, and is the one field
# that ties a Sentry event back to a log line.
_SENSITIVE_HEADERS = frozenset(
    {"authorization", "cookie", "x-api-key", "x-forwarded-authorization", "proxy-authorization"}
)

# Query params that can carry a secret and must never reach the error
# tracker. The team-claim flow (ProfileService.getClaimable) sends the team
# access code as a query param; Sentry's fetch breadcrumbs and
# request.query_string record full URLs even with send_default_pii=False.
_SENSITIVE_QUERY_PARAMS = frozenset({"access_code"})


def _scrub_query_string(query_string: str) -> str:
    if not query_string or not any(p in query_string for p in _SENSITIVE_QUERY_PARAMS):
        return query_string
    pairs = []
    for pair in query_string.split("&"):
        key = pair.split("=", 1)[0]
        if key in _SENSITIVE_QUERY_PARAMS:
            pairs.append(f"{key}=[scrubbed]")
        else:
            pairs.append(pair)
    return "&".join(pairs)


def _scrub_sensitive(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
    """before_send hook: drop credential-bearing headers and query params."""
    request = event.get("request", {})
    headers = request.get("headers")
    if isinstance(headers, dict):
        for key in headers:
            if key.lower() in _SENSITIVE_HEADERS:
                headers[key] = "[scrubbed]"

    query_string = request.get("query_string")
    if isinstance(query_string, str):
        request["query_string"] = _scrub_query_string(query_string)

    url = request.get("url")
    if isinstance(url, str) and "access_code=" in url:
        base, _, _ = url.partition("?")
        request["url"] = base

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
        release=settings.RELEASE,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
        send_default_pii=False,
        # Sentry types before_send as (Event, Hint) -> Event | None; Event is a
        # TypedDict, so our dict-based scrubber is runtime-correct here.
        before_send=_scrub_sensitive,  # type: ignore[arg-type]
    )
    logger.info("Sentry initialised for environment=%s release=%s", settings.ENV, settings.RELEASE)


def traced(name: str) -> Any:
    """Wrap the expensive-path spans (scoring recompute, leaderboard rebuild,
    badge evaluation) so call sites stay clean regardless of whether Sentry is
    configured. No-op span when no DSN is set."""
    if not settings.SENTRY_DSN:
        return _nullcontext()
    import sentry_sdk

    return sentry_sdk.start_span(name=name)


class _nullcontext:
    def __enter__(self) -> None:
        return None

    def __exit__(self, *exc_info: object) -> None:
        return None
