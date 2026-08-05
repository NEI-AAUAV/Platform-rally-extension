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

import {
  ARRIVAL_QUEUE_CHANGED_EVENT,
  drainArrivals,
  enqueueArrival,
  listArrivals,
  removeArrival,
} from "./arrivalQueue";

const at = (checkpointId: number, latitude = 41.1, longitude = -8.6) => ({
  checkpointId,
  latitude,
  longitude,
});

describe("arrivalQueue", () => {
  beforeEach(() => store.clear());

  it("queues an arrival with the coordinates captured at the post", async () => {
    await enqueueArrival(at(1, 41.5, -8.2));

    const items = await listArrivals();
    expect(items[0]).toMatchObject({
      checkpointId: 1,
      latitude: 41.5,
      longitude: -8.2,
      status: "pending",
    });
  });

  it("keeps one entry per checkpoint, refreshed with the newest fix", async () => {
    await enqueueArrival(at(1, 41.0, -8.0));
    await enqueueArrival(at(1, 41.2, -8.1));

    const items = await listArrivals();
    expect(items).toHaveLength(1);
    // Newest coordinates win: a second tap means the team moved closer.
    expect(items[0]).toMatchObject({ latitude: 41.2 });
  });

  it("queues different checkpoints separately", async () => {
    await enqueueArrival(at(1));
    await enqueueArrival(at(2));

    expect(await listArrivals()).toHaveLength(2);
  });

  it("notifies listeners when the queue changes", async () => {
    const onChange = vi.fn();
    window.addEventListener(ARRIVAL_QUEUE_CHANGED_EVENT, onChange);

    await enqueueArrival(at(1));

    expect(onChange).toHaveBeenCalled();
    window.removeEventListener(ARRIVAL_QUEUE_CHANGED_EVENT, onChange);
  });

  it("replays queued arrivals with their stored coordinates and drops them", async () => {
    await enqueueArrival(at(1, 41.5, -8.2));
    const replay = vi.fn().mockResolvedValue(undefined);

    const synced = await drainArrivals(replay);

    expect(synced).toBe(1);
    expect(replay).toHaveBeenCalledWith(expect.objectContaining({ latitude: 41.5 }));
    expect(await listArrivals()).toEqual([]);
  });

  it("keeps an arrival queued and marks it failed when the replay rejects", async () => {
    await enqueueArrival(at(1));

    const synced = await drainArrivals(vi.fn().mockRejectedValue(new Error("offline")));

    expect(synced).toBe(0);
    expect((await listArrivals())[0]).toMatchObject({ status: "failed" });
  });

  it("drains a mixed queue without letting one failure block the rest", async () => {
    await enqueueArrival(at(1));
    await enqueueArrival(at(2));
    const replay = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);

    const synced = await drainArrivals(replay);

    expect(synced).toBe(1);
    const items = await listArrivals();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checkpointId: 1 });
  });

  it("removes an arrival by checkpoint", async () => {
    await enqueueArrival(at(1));
    await enqueueArrival(at(2));

    await removeArrival(1);

    expect((await listArrivals()).map((i) => i.checkpointId)).toEqual([2]);
  });
});
