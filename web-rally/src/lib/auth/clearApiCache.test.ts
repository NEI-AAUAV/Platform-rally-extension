import { describe, it, expect, vi, afterEach } from "vitest";
import { clearApiCache } from "./clearApiCache";

const setServiceWorker = (value: unknown): void => {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value,
  });
};

describe("clearApiCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("tells the active worker to drop its API cache", async () => {
    const postMessage = vi.fn();
    setServiceWorker({
      getRegistration: async () => ({ active: { postMessage } }),
    });

    await clearApiCache();

    expect(postMessage).toHaveBeenCalledWith({ action: "clearApiCache" });
  });

  it("is a no-op where service workers are unsupported", async () => {
    // jsdom has no navigator.serviceWorker; deleting it models an older
    // browser (and dev, where the worker is not registered).
    Reflect.deleteProperty(navigator, "serviceWorker");

    await expect(clearApiCache()).resolves.toBeUndefined();
  });

  it("does not throw when no worker is registered yet", async () => {
    setServiceWorker({ getRegistration: async () => undefined });

    await expect(clearApiCache()).resolves.toBeUndefined();
  });

  it("swallows a failing lookup so sign-out is never blocked by it", async () => {
    // A sign-out that fails because a cache purge failed would leave the user
    // logged in — strictly worse than a stale public cache.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setServiceWorker({
      getRegistration: async () => {
        throw new Error("SecurityError");
      },
    });

    await expect(clearApiCache()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
