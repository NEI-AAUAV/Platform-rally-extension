import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * The service worker's runtime API route decides, per request, whether a
 * response may be written to Cache Storage. Cache Storage is keyed on the URL,
 * and several endpoints return a different body for the same URL depending on
 * the bearer token, so a matcher that says "yes" to an authenticated request is
 * a cross-identity data leak — not a caching inefficiency. These tests pin the
 * matcher itself.
 */

type RouteMatcher = (options: { url: URL; request: Request }) => boolean;

const registeredMatchers: RouteMatcher[] = [];
const messageListeners: Array<(event: unknown) => void> = [];
const deletedCaches: string[] = [];

vi.mock("workbox-precaching", () => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
}));
vi.mock("workbox-routing", () => ({
  registerRoute: (matcher: RouteMatcher | unknown) => {
    if (typeof matcher === "function") registeredMatchers.push(matcher as RouteMatcher);
  },
  NavigationRoute: class {},
}));
vi.mock("workbox-strategies", () => ({
  NetworkFirst: class {},
  CacheFirst: class {},
}));
vi.mock("workbox-expiration", () => ({ ExpirationPlugin: class {} }));

/** The API route is the only one registered with a function matcher that
 * inspects `url`; the static-asset route matches on `request.destination`. */
const apiMatcher = (): RouteMatcher => {
  const match = registeredMatchers.find((candidate) =>
    candidate({
      url: new URL("http://localhost/api/rally/v1/checkpoint/"),
      request: new Request("http://localhost/api/rally/v1/checkpoint/"),
    }),
  );
  if (!match) throw new Error("no API route matcher was registered");
  return match;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const matches = (path: string, init?: RequestInit): boolean =>
  apiMatcher()({ url: new URL(`http://localhost${path}`), request: req(path, init) });

const withToken: RequestInit = { headers: { Authorization: "Bearer team-token" } };

beforeAll(async () => {
  (globalThis as { __WB_MANIFEST?: unknown }).__WB_MANIFEST = [];
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
      match: async () => undefined,
      open: async () => ({ match: async () => undefined, put: async () => undefined }),
    },
  });
  const original = globalThis.addEventListener.bind(globalThis);
  vi.spyOn(globalThis, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "message") messageListeners.push(listener as (event: unknown) => void);
    return original(type, listener as EventListener, options);
  });
  await import("./sw");
});

describe("service worker API caching route", () => {
  it("caches an unauthenticated GET, whose body is the public representation", () => {
    expect(matches("/api/rally/v1/checkpoint/")).toBe(true);
  });

  it("refuses to cache a GET carrying a bearer token", () => {
    // The exact leak reported: /checkpoint/ returns the admin, per-team or
    // public slice for one and the same URL. Caching the authenticated
    // response lets NetworkFirst replay it to whoever holds the device next.
    expect(matches("/api/rally/v1/checkpoint/", withToken)).toBe(false);
  });

  it("matches the Authorization header case-insensitively", () => {
    expect(matches("/api/rally/v1/checkpoint/", { headers: { authorization: "Bearer x" } })).toBe(
      false,
    );
  });

  it("excludes every authenticated endpoint, not a named denylist", () => {
    // A new team-scoped endpoint must be excluded the day it is added, with
    // no service-worker change — that is the point of testing the header.
    for (const path of [
      "/api/rally/v1/team/me",
      "/api/rally/v1/checkpoint/1/hint",
      "/api/rally/v1/scoreboard/",
      "/api/rally/v1/some/endpoint/invented/tomorrow",
    ]) {
      expect(matches(path, withToken)).toBe(false);
    }
  });

  it("still refuses event streams, the evaluate endpoint and auth paths", () => {
    expect(matches("/api/rally/v1/scoreboard/stream")).toBe(false);
    expect(
      matches("/api/rally/v1/scoreboard/live", { headers: { accept: "text/event-stream" } }),
    ).toBe(false);
    expect(matches("/api/rally/v1/checkpoint/1/evaluate")).toBe(false);
    expect(matches("/api/rally/v1/auth/login")).toBe(false);
    expect(matches("/api/rally/v1/oidc/callback")).toBe(false);
  });

  it("ignores non-API URLs", () => {
    expect(matches("/rally/index.html")).toBe(false);
  });

  it("drops the API cache when the page signals a sign-out", async () => {
    deletedCaches.length = 0;
    const waited: Array<Promise<unknown>> = [];
    for (const listener of messageListeners) {
      listener({
        data: { action: "clearApiCache" },
        waitUntil: (promise: Promise<unknown>) => waited.push(promise),
      });
    }
    await Promise.all(waited);
    expect(deletedCaches).toContain("rally-api");
  });
});
