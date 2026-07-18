import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory stand-in for idb-keyval (jsdom has no IndexedDB).
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => store.get(key),
  set: async (key: string, val: unknown) => {
    store.set(key, val);
  },
}));

import { enqueue, list, drain, markSynced } from "./evalQueue";

const base = {
  teamId: 1,
  activityId: 2,
  resultData: {
    result_data: { assigned_points: 50 },
    extra_shots: 0,
    penalties: {},
  },
};

describe("evalQueue", () => {
  beforeEach(() => store.clear());

  it("enqueues a pending entry", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("pending");
    expect(items[0].idempotencyKey).toBe("k1");
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

  it("drain marks failed entries and keeps them", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await drain(async () => {
      throw new Error("network down");
    });
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("failed");
  });

  it("markSynced drops an entry", async () => {
    await enqueue({ idempotencyKey: "k1", ...base });
    await markSynced("k1");
    expect(await list()).toHaveLength(0);
  });
});
