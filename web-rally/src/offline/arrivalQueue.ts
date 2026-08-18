/**
 * Durable offline queue for GPS checkpoint arrivals.
 *
 * A peddy-paper is played outdoors on mobile data: the moment a team reaches a
 * post is exactly the moment their signal is least reliable. A failed check-in
 * is persisted here with the coordinates captured at the time, and replayed
 * when connectivity returns — so the team is credited for where they actually
 * stood, not where they happen to be when the network comes back.
 *
 * No idempotency key is needed: the server enforces a unique
 * (team_id, checkpoint_id) arrival, so a replay of an arrival that did reach
 * the server comes back as `already_registered` rather than a duplicate. That
 * pair is also this queue's identity, which keeps repeated taps on a dead
 * network from stacking up entries.
 *
 * Deliberately a sibling of {@link ./evalQueue} rather than a generalization of
 * it: the two differ in identity, payload and replay call, and the shared part
 * (an idb-keyval list with a change event) is small enough that merging them
 * would cost more clarity than it saves.
 */
import { get, set } from "idb-keyval";
import { createQueueStore, ARRIVAL_STORE_NAME } from "./db";

export type QueuedArrivalStatus = "pending" | "failed";

export interface QueuedArrival {
  checkpointId: number;
  /** Coordinates as captured when the team was at the post. */
  latitude: number;
  longitude: number;
  status: QueuedArrivalStatus;
  createdAt: number;
}

const STORE = createQueueStore(ARRIVAL_STORE_NAME);
const QUEUE_KEY = "queue";

/** Fired whenever the queue's contents change, so UI can refresh without polling. */
export const ARRIVAL_QUEUE_CHANGED_EVENT = "rally-arrival-queue-changed";

async function readAll(): Promise<QueuedArrival[]> {
  return (await get<QueuedArrival[]>(QUEUE_KEY, STORE)) ?? [];
}

async function writeAll(items: QueuedArrival[]): Promise<void> {
  await set(QUEUE_KEY, items, STORE);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ARRIVAL_QUEUE_CHANGED_EVENT));
  }
}

/**
 * Queue an arrival for replay. Re-queueing the same checkpoint refreshes the
 * stored coordinates: the newest fix is the one closest to the geofence, and a
 * team that taps twice is standing in a slightly better spot the second time.
 */
export async function enqueueArrival(
  item: Omit<QueuedArrival, "status" | "createdAt">,
): Promise<void> {
  const items = await readAll();
  const rest = items.filter((i) => i.checkpointId !== item.checkpointId);
  rest.push({ ...item, status: "pending", createdAt: Date.now() });
  await writeAll(rest);
}

export async function listArrivals(): Promise<QueuedArrival[]> {
  return readAll();
}

export async function removeArrival(checkpointId: number): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((i) => i.checkpointId !== checkpointId));
}

async function markArrivalFailed(checkpointId: number): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((i) => (i.checkpointId === checkpointId ? { ...i, status: "failed" as const } : i)),
  );
}

/**
 * Replay every queued arrival. Entries that replay successfully are dropped.
 *
 * `replay` must reject only on failures worth retrying. A rejection leaves the
 * entry queued and marked failed — including the case where the event window
 * has since closed, which no amount of retrying will fix; those surface in the
 * UI so a team can raise it with staff rather than silently losing the post.
 *
 * Returns the number of arrivals that were accepted, so callers know whether
 * any server state changed and views need refreshing.
 */
export async function drainArrivals(
  replay: (item: QueuedArrival) => Promise<void>,
): Promise<number> {
  const items = await readAll();
  let synced = 0;
  for (const item of items) {
    try {
      await replay(item);
      await removeArrival(item.checkpointId);
      synced += 1;
    } catch {
      await markArrivalFailed(item.checkpointId);
    }
  }
  return synced;
}
