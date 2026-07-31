import os
import pathlib
from functools import lru_cache
from typing import Annotated, Any, TypeAlias
from urllib.parse import urljoin

from fastapi import Depends
from pydantic import AnyHttpUrl, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project Directories
ROOT = pathlib.Path(__file__).resolve().parent.parent


def split_comma_list(v: Any) -> list[str] | Any:
    if isinstance(v, str):
        return [i.strip() for i in v.split(",") if i.strip()]
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True)

    ENV: str = os.getenv("ENV", "development")
    PRODUCTION: bool = os.getenv("ENV") == "production"

    # Error tracking (Sentry / GlitchTip — same SDK, self-host just swaps the
    # DSN). Optional: when unset, error tracking is a no-op and nothing is sent.
    SENTRY_DSN: str | None = os.getenv("SENTRY_DSN") or None
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    SENTRY_PROFILES_SAMPLE_RATE: float = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0"))

    # Logging. LOG_JSON switches the loguru sink from the human-readable
    # colored format to one-JSON-object-per-line (serialize=True) so a log
    # shipper (Loki/ELK) can index it; LOG_LEVEL overrides the PRODUCTION-based
    # default. RELEASE tags both logs and Sentry events with a build
    # identifier (CI should set it to the git sha) so an event/log line can be
    # attributed to the deploy that produced it.
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO" if PRODUCTION else "DEBUG")
    LOG_JSON: bool = os.getenv("LOG_JSON", "true" if PRODUCTION else "false").lower() == "true"
    RELEASE: str = os.getenv("RELEASE", "dev")

    # SQLAlchemy statement echo. Off by default even in development: the echo
    # goes through the loguru intercept, so every statement is formatted and
    # written twice and a handful of requests per second is enough to dominate
    # the process's CPU time. Set SQL_ECHO=true when debugging queries.
    SQL_ECHO: bool = os.getenv("SQL_ECHO", "false").lower() == "true"

    # Prometheus /metrics endpoint. On by default; must be blocked at the
    # reverse proxy in production (it is not itself access-controlled).
    METRICS_ENABLED: bool = os.getenv("METRICS_ENABLED", "true").lower() == "true"

    API_V1_STR: str = "/api/rally/v1"
    STATIC_STR: str = "/static/rally"

    HOST: AnyHttpUrl = AnyHttpUrl(
        "https://nei.web.ua.pt" if PRODUCTION else "http://localhost:8000"
    )
    STATIC_URL: AnyHttpUrl = AnyHttpUrl(urljoin(str(HOST), STATIC_STR))

    # Cloudflare R2 object storage (branding image uploads). Optional:
    # when unset, upload endpoints return 503 and the app falls back to
    # bundled defaults. Same contract as the gala/family extensions.
    R2_ENDPOINT_URL: str | None = os.getenv("R2_ENDPOINT_URL")
    R2_ACCESS_KEY_ID: str | None = os.getenv("R2_ACCESS_KEY_ID")
    R2_SECRET_ACCESS_KEY: str | None = os.getenv("R2_SECRET_ACCESS_KEY")
    R2_BUCKET: str | None = os.getenv("R2_BUCKET")
    R2_PUBLIC_BASE_URL: str | None = os.getenv("R2_PUBLIC_BASE_URL")

    # BACKEND_CORS_ORIGINS is a JSON-formatted list of origins
    BACKEND_CORS_ORIGINS: list[AnyHttpUrl] = [
        AnyHttpUrl("https://nei.web.ua.pt" if PRODUCTION else "http://localhost:3000")
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str] | str:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        if isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Redis (realtime foundation: cache + event pub/sub for the live
    # scoreboard). Mirrors the NEI gamification system's config.
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: str | None = os.getenv("REDIS_PASSWORD") or None
    REDIS_CONNECTION_TIMEOUT: int = int(os.getenv("REDIS_CONNECTION_TIMEOUT", "5"))
    # Event/worker/realtime subsystem. On by default (uniform with the
    # gamification system); EVENTS_FAIL_SILENTLY keeps a Redis outage from
    # breaking requests — publishes are logged and swallowed instead of raised.
    EVENTS_ENABLED: bool = os.getenv("EVENTS_ENABLED", "true").lower() == "true"
    EVENTS_FAIL_SILENTLY: bool = os.getenv("EVENTS_FAIL_SILENTLY", "true").lower() == "true"
    # When on, the expensive score recompute (activity-wide rescore +
    # per-team totals) is moved OFF the request path: write routes persist the
    # raw result and publish an activity_result.* event, and the scoring worker
    # recomputes in the background. Trades immediate staff-side consistency for
    # a faster write path, so it stays OFF by default and only takes effect
    # when EVENTS_ENABLED is also set (otherwise no worker would ever catch up).
    RECOMPUTE_OFF_PATH: bool = os.getenv("RECOMPUTE_OFF_PATH", "false").lower() == "true"

    # Team QR self-check-in. A checkpoint shows a short-lived HMAC-signed QR;
    # a team scans it to check itself into that checkpoint (replacing staff
    # gating). Off by default — a rally opts in. The signing secret falls back
    # to TEAM_JWT_SECRET_KEY when unset, so no new mandatory env is required.
    SELF_CHECKIN_ENABLED: bool = os.getenv("SELF_CHECKIN_ENABLED", "false").lower() == "true"
    CHECKIN_HMAC_SECRET: str | None = os.getenv("CHECKIN_HMAC_SECRET") or None
    CHECKIN_TOKEN_TTL_SECONDS: int = int(os.getenv("CHECKIN_TOKEN_TTL_SECONDS", "90"))

    # Web Push (VAPID). Optional: when the key pair is unset, the subscribe
    # endpoint returns 503 and the frontend never prompts for permission —
    # same fallback contract as R2. Generate a pair with `vapid --gen`
    # (py-vapid, a pywebpush dependency) or `web-push generate-vapid-keys`.
    VAPID_PUBLIC_KEY: str | None = os.getenv("VAPID_PUBLIC_KEY") or None
    VAPID_PRIVATE_KEY: str | None = os.getenv("VAPID_PRIVATE_KEY") or None
    VAPID_SUBJECT: str = os.getenv("VAPID_SUBJECT", "mailto:admin@nei.web.ua.pt")

    # PostgreSQL DB
    SCHEMA_NAME: str = "rally_tascas"

    # Rally scoring penalties and bonuses
    EXTRA_SHOT_BONUS: int = (
        1  # Points added per extra shot (fallback default; RallySettings is source of truth)
    )
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "postgres")
    POSTGRES_URI: PostgresDsn = PostgresDsn(
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:5432/{POSTGRES_DB}"
    )
    TEST_POSTGRES_URI: PostgresDsn = PostgresDsn(
        f"postgresql://{POSTGRES_USER}"
        f":{POSTGRES_PASSWORD}@{POSTGRES_SERVER}"
        f":5432/{POSTGRES_DB}_test"
    )

    # Database connection pool tuning. Overridable via env for prod sizing.
    # pool_pre_ping guards against stale connections (server restart, idle
    # timeout, failover); pool_recycle proactively drops long-lived conns.
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    DB_POOL_RECYCLE_SECONDS: int = int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800"))
    # When behind a transaction-pooling proxy (pgbouncer), server-side pooling
    # conflicts with SQLAlchemy's pool. Set true to use NullPool instead.
    DB_DISABLE_POOL: bool = os.getenv("DB_DISABLE_POOL", "").lower() in {"1", "true", "yes"}

    # OIDC authentication
    # Rally is a pure OIDC resource server: it validates access tokens minted
    # by the provider via JWKS discovery. It does NOT mint its own tokens.
    OIDC_PROVIDER_URL: str = os.getenv("OIDC_PROVIDER_URL", "")
    OIDC_CLIENT_ID: str = os.getenv("OIDC_CLIENT_ID", "")
    OIDC_APPLICATION_SLUG: str = os.getenv("OIDC_APPLICATION_SLUG", "rally")
    ## authentik group names mapped to rally scopes (ScopeEnum).
    OIDC_ADMIN_GROUP: str = os.getenv("OIDC_ADMIN_GROUP", "admin")
    OIDC_MANAGER_GROUP: str = os.getenv("OIDC_MANAGER_GROUP", "manager-rally")
    OIDC_STAFF_GROUP: str = os.getenv("OIDC_STAFF_GROUP", "rally-staff")
    OIDC_GUIDE_GROUP: str = os.getenv("OIDC_GUIDE_GROUP", "rally-guide")

    # Authentik management API (optional). When set, admins can search ALL
    # Authentik accounts (not only those mirrored locally after a first login)
    # to link a real account to a name-only placeholder member.
    # AUTHENTIK_API_URL points at the API root, e.g. "https://auth.example.com/api/v3".
    AUTHENTIK_API_URL: str = os.getenv("AUTHENTIK_API_URL", "")
    AUTHENTIK_API_TOKEN: str = os.getenv("AUTHENTIK_API_TOKEN", "")

    # Team authentication (independent: rally mints its own HS256 team tokens)
    ## Secret key for team JWT tokens
    TEAM_JWT_SECRET_KEY: str | None = os.getenv("TEAM_JWT_SECRET_KEY")
    TEAM_JWT_ALGORITHM: str = "HS256"
    ## Token expiration time in hours (24 hours = 1 day)
    TEAM_TOKEN_EXPIRE_HOURS: int = 24
    ## Absolute session lifetime: /refresh cannot extend a token chain beyond
    ## this many hours after the original login (0 disables the cap).
    TEAM_TOKEN_MAX_LIFETIME_HOURS: int = int(os.getenv("TEAM_TOKEN_MAX_LIFETIME_HOURS", "168"))
    ## Team login brute-force guard: max attempts per client IP per window.
    TEAM_LOGIN_RATE_LIMIT_ATTEMPTS: int = int(os.getenv("TEAM_LOGIN_RATE_LIMIT_ATTEMPTS", "10"))
    TEAM_LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = int(
        os.getenv("TEAM_LOGIN_RATE_LIMIT_WINDOW_SECONDS", "300")
    )
    ## Coarse rate limit for authenticated write/verify endpoints (per client,
    ## per window). Higher than login: legitimate teams check in repeatedly.
    WRITE_RATE_LIMIT_ATTEMPTS: int = int(os.getenv("WRITE_RATE_LIMIT_ATTEMPTS", "60"))
    WRITE_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("WRITE_RATE_LIMIT_WINDOW_SECONDS", "60"))

    ## Reverse-proxy hops we trust to set X-Forwarded-For. Comma-separated list
    ## of proxy IPs (e.g. "10.0.0.1,10.0.0.2"). Empty (default) => never trust
    ## the header, always use the direct peer address. Prevents both spoofed
    ## client IPs and proxy-collapse over-blocking.
    TRUSTED_PROXIES: list[str] = []

    @field_validator("TRUSTED_PROXIES", mode="before")
    @classmethod
    def assemble_trusted_proxies(cls, v: Any) -> list[str] | Any:
        return split_comma_list(v)

    ## OIDC JWKS cache TTL (seconds). The resource server caches the provider
    ## keyset instead of refetching it on every token validation; a cache miss
    ## on an unknown signing key forces a refresh to support key rotation.
    OIDC_JWKS_CACHE_TTL_SECONDS: int = int(os.getenv("OIDC_JWKS_CACHE_TTL_SECONDS", "600"))
    ## Algorithms the resource server accepts for provider tokens. Pinned so a
    ## token cannot dictate its own (alg-confusion / "none" defence).
    OIDC_ALLOWED_ALGORITHMS: list[str] = ["RS256"]

    @field_validator("OIDC_ALLOWED_ALGORITHMS", mode="before")
    @classmethod
    def assemble_oidc_algs(cls, v: Any) -> list[str] | Any:
        return split_comma_list(v)

    @field_validator("TEAM_JWT_SECRET_KEY")
    @classmethod
    def validate_team_jwt_secret_key(cls, v: str | None) -> str:
        if not v:
            raise ValueError(
                "TEAM_JWT_SECRET_KEY environment variable must be set to a non-empty value"
            )
        return v


settings = Settings()


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Kept as an explicit TypeAlias rather than a PEP 695 `type` statement: FastAPI
# unwraps Annotated dependency markers at import time, and a lazily-evaluated
# TypeAliasType does not resolve to Depends(get_settings) there.
SettingsDep: TypeAlias = Annotated[Settings, Depends(get_settings)]  # noqa: UP040
