import * as Sentry from "@sentry/react";
import { captureError } from "@/lib/sentry";

type LogLevel = "debug" | "info" | "warning" | "error";

function toBreadcrumb(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: "app", level, message, data });
}

/**
 * Console output only in dev builds; a Sentry breadcrumb in every mode so an
 * `error()` call has surrounding context when it's later reported. `error()`
 * additionally escalates to a captured Sentry event.
 */
export const logger = {
  debug(message: string, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.debug(message, data);
    toBreadcrumb("debug", message, data);
  },
  info(message: string, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.info(message, data);
    toBreadcrumb("info", message, data);
  },
  warn(message: string, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.warn(message, data);
    toBreadcrumb("warning", message, data);
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.error(message, error, data);
    toBreadcrumb("error", message, data);
    captureError(error ?? new Error(message), data);
  },
};
