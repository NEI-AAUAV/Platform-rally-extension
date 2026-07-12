import * as Sentry from "@sentry/react";

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
    tracesSampleRate: 0.1,
    // Do not attach request bodies / cookies by default.
    sendDefaultPii: false,
  });
}

/** Report a caught error to Sentry (no-op when Sentry was never initialised). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
