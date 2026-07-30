import * as Sentry from "@sentry/react";

// Query params that can carry a secret and must never reach Sentry. The
// team-claim flow (ProfileService.getClaimable) sends the team access code
// as a query param — Sentry records full URLs in fetch breadcrumbs and
// request context even with sendDefaultPii: false.
const SENSITIVE_QUERY_PARAMS = ["access_code"];

function scrubUrl(url: string): string {
  if (!SENSITIVE_QUERY_PARAMS.some((p) => url.includes(`${p}=`))) {
    return url;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    for (const param of SENSITIVE_QUERY_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[scrubbed]");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const url = breadcrumb.data?.url;
  if (typeof url === "string") {
    breadcrumb.data = { ...breadcrumb.data, url: scrubUrl(url) };
  }
  return breadcrumb;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const url = event.request?.url;
  if (typeof url === "string" && event.request) {
    event.request.url = scrubUrl(url);
  }
  return event;
}

/**
 * Initialise Sentry error tracking when a DSN is configured.
 *
 * Gated on `VITE_SENTRY_DSN`: with no DSN (the default in dev) this is a no-op,
 * so nothing is sent and the SDK stays inert. Same SDK works against a
 * self-hosted GlitchTip — only the DSN changes.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    integrations: [Sentry.browserTracingIntegration()],
    // Do not attach request bodies / cookies by default.
    sendDefaultPii: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}

/** Report a caught error to Sentry (no-op when Sentry was never initialised). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Tag events with an opaque team ID — never the team name or access code. */
export function setSentryUser(teamId: number | string): void {
  Sentry.setUser({ id: String(teamId) });
}

export function clearSentryUser(): void {
  Sentry.setUser(null);
}
