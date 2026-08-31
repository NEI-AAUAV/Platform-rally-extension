import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// In-memory stand-in for idb-keyval's `update` (jsdom has no IndexedDB).
// `update` runs the updater against whatever is currently stored and
// persists the result — the real read-modify-write contract evalQueue now
// relies on for atomicity (see mutate() in evalQueue.ts).
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  // Real idb-keyval `get` resolves to the stored value; `update` resolves to
  // `void`. evalQueue reads via `get` and writes via `update`.
  get: async (key: string) => store.get(key),
  update: async (key: string, updater: (v: unknown) => unknown) => {
    store.set(key, updater(store.get(key)));
  },
}));

import {
  enqueue,
  list,
  drain,
  markSynced,
  markFailed,
  retryFailed,
  discard,
  EVAL_SYNC_TAG,
} from "./evalQueue";

const base = {
  teamId: 1,
  activityId: 2,
  resultData: {
    result_data: { assigned_points: 50 },
    extra_shots: 0,
    penalty_counts: {},
  },
};

describe("evalQueue", () => {
  beforeEach(() => store.clear());

  it("enqueues a pending entry with zero attempts", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("pending");
    expect(items[0]?.idempotencyKey).toBe("k1");
    expect(items[0]?.attempts).toBe(0);
  });

  it("dedupes by idempotency key", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await enqueue({ idempotencyKey: "k1", ...base });
    expect(await list()).toHaveLength(1);
  });

  it("drain removes entries that replay successfully", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await enqueue({ idempotencyKey: "k2", ...base });
    const replayed: string[] = [];
    await drain(async (item) => {
      replayed.push(item.idempotencyKey);
    });
    expect(replayed.sort()).toEqual(["k1", "k2"]);
    expect(await list()).toHaveLength(0);
  });

  it("C4: a network failure (TypeError) leaves the entry pending and bumps attempts, not failed", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await drain(async () => {
      throw new TypeError("Failed to fetch");
    });
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("pending");
    expect(items[0]?.attempts).toBe(1);
  });

  it("C4: a server error (parsed HTTP error body) marks the entry permanently failed with a reason", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await drain(async () => {
      throw { detail: "Unknown penalty type(s): made_up" };
    });
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("failed");
    expect(items[0]?.lastError).toBe("Unknown penalty type(s): made_up");
  });

  it("C4: a failed entry is skipped by later drains until retryFailed is called", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await drain(async () => {
      throw { detail: "422 desligado" };
    });
    expect((await list())[0]?.status).toBe("failed");

    const replay = vi.fn();
    await drain(replay);
    expect(replay).not.toHaveBeenCalled();

    await retryFailed("k1");
    expect((await list())[0]?.status).toBe("pending");
    await drain(replay);
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("C4: a network failure is marked permanently failed once the retry budget is spent", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    for (let i = 0; i < 10; i += 1) {
      await drain(async () => {
        throw new TypeError("network down");
      });
    }
    const items = await list();
    expect(items[0]?.status).toBe("failed");
    expect(items[0]?.attempts).toBe(10);
  });

  it("markSynced drops an entry", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await markSynced("k1");
    expect(await list()).toHaveLength(0);
  });

  it("returns an empty list when nothing has ever been stored", async () => {
    expect(await list()).toEqual([]);
  });

  it("markFailed marks the matching entry as failed with a reason, without dropping it", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await markFailed("k1", "boom");
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("failed");
    expect(items[0]?.lastError).toBe("boom");
  });

  it("discard removes an entry outright", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await markFailed("k1", "boom");
    await discard("k1");
    expect(await list()).toHaveLength(0);
  });

  it("markSynced only drops the matching entry, leaving others untouched", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await enqueue({ idempotencyKey: "k2", ...base });
    await markSynced("k1");
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]?.idempotencyKey).toBe("k2");
  });

  /**
   * Background Sync is a Chrome-only supplement on top of the foreground
   * drain, never a replacement: iOS Safari has no such API, and that is where
   * much of the staff runs. These tests pin that the queue is written first and
   * that a missing or failing API cannot cost us an entry.
   */
  describe("background sync registration", () => {
    const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

    function stubServiceWorker(value: unknown) {
      Object.defineProperty(navigator, "serviceWorker", {
        value,
        configurable: true,
        writable: true,
      });
    }

    afterEach(() => {
      if (originalServiceWorker) {
        Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
      } else {
        // jsdom has no navigator.serviceWorker to restore.
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
    });

    it("registers the sync tag after persisting the entry", async () => {
      const register = vi.fn().mockResolvedValue(undefined);
      stubServiceWorker({ ready: Promise.resolve({ sync: { register } }) });

      await enqueue({ idempotencyKey: "k1", ...base });

      expect(register).toHaveBeenCalledWith(EVAL_SYNC_TAG);
      expect(await list()).toHaveLength(1);
    });

    it("still queues where Background Sync does not exist (iOS Safari)", async () => {
      stubServiceWorker({ ready: Promise.resolve({}) });

      await enqueue({ idempotencyKey: "k1", ...base });

      const items = await list();
      expect(items).toHaveLength(1);
      expect(items[0]?.status).toBe("pending");
    });

    it("still queues when the browser refuses the sync registration", async () => {
      stubServiceWorker({
        ready: Promise.resolve({
          sync: { register: vi.fn().mockRejectedValue(new Error("permission denied")) },
        }),
      });

      await expect(enqueue({ idempotencyKey: "k1", ...base })).resolves.toBeUndefined();
      expect(await list()).toHaveLength(1);
    });
  });
});
