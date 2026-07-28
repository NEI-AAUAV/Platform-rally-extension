import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
}));

vi.mock("@sentry/react", () => ({
  init: h.init,
  captureException: h.captureException,
  addBreadcrumb: h.addBreadcrumb,
  setUser: h.setUser,
  browserTracingIntegration: h.browserTracingIntegration,
}));

import { initSentry, captureError, setSentryUser, clearSentryUser } from "@/lib/sentry";

describe("initSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("is a no-op when no DSN is configured", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    initSentry();
    expect(h.init).not.toHaveBeenCalled();
  });

  it("initialises Sentry when a DSN is configured", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://example.ingest.sentry.io/1");
    initSentry();
    expect(h.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://example.ingest.sentry.io/1",
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
      }),
    );
  });

  it("scrubs access_code from a breadcrumb url", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://example.ingest.sentry.io/1");
    initSentry();
    const { beforeBreadcrumb } = h.init.mock.calls[0]![0];
    const scrubbed = beforeBreadcrumb({
      data: { url: "https://rally.example/api/rally/v1/profile/claimable?access_code=SECRET" },
    });
    expect(scrubbed.data.url).not.toContain("SECRET");
    expect(scrubbed.data.url).toContain("access_code=%5Bscrubbed%5D");
  });

  it("scrubs access_code from an error event request url", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://example.ingest.sentry.io/1");
    initSentry();
    const { beforeSend } = h.init.mock.calls[0]![0];
    const scrubbed = beforeSend({
      request: { url: "https://rally.example/api/rally/v1/profile/claimable?access_code=SECRET" },
    });
    expect(scrubbed.request.url).not.toContain("SECRET");
  });
});

describe("setSentryUser / clearSentryUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets an opaque team id as the Sentry user", () => {
    setSentryUser(42);
    expect(h.setUser).toHaveBeenCalledWith({ id: "42" });
  });

  it("clears the Sentry user", () => {
    clearSentryUser();
    expect(h.setUser).toHaveBeenCalledWith(null);
  });
});

describe("captureError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the error without extra context", () => {
    const err = new Error("boom");
    captureError(err);
    expect(h.captureException).toHaveBeenCalledWith(err, undefined);
  });

  it("reports the error with extra context", () => {
    const err = new Error("boom");
    captureError(err, { teamId: 5 });
    expect(h.captureException).toHaveBeenCalledWith(err, { extra: { teamId: 5 } });
  });
});
