/**
 * Durable offline queue for staff evaluation submits.
 *
 * Staff evaluate on phones over flaky venue wifi. When a submit fails because
 * the device is offline (or the network drops mid-request), it is persisted
 * here in IndexedDB and replayed when connectivity returns. Each entry carries
 * a stable `idempotencyKey` so replays are recognized by the backend as
 * duplicates rather than re-applying the score.
 *
 * Backed by idb-keyval (a single IndexedDB store) — no service-worker Background
 * Sync, which is unreliable on iOS Safari where most staff run.
 */
import { get, set, createStore } from "idb-keyval";
import type { ActivityResultData } from "@/types/forms";

export type QueuedEvalStatus = "pending" | "synced" | "failed";

export interface QueuedEval {
  /** Stable idempotency key; reused verbatim on every replay. */
  idempotencyKey: string;
  teamId: number;
  activityId: number;
  resultData: ActivityResultData;
  status: QueuedEvalStatus;
  createdAt: number;
}

const STORE = createStore("rally-offline", "eval-queue");
const QUEUE_KEY = "queue";

async function readAll(): Promise<QueuedEval[]> {
  return (await get<QueuedEval[]>(QUEUE_KEY, STORE)) ?? [];
}

/** Fired whenever the queue's contents change, so UI can refresh without polling. */
export const QUEUE_CHANGED_EVENT = "rally-offline-queue-changed";

async function writeAll(items: QueuedEval[]): Promise<void> {
  await set(QUEUE_KEY, items, STORE);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  }
}

/** Append a submit to the queue (idempotencyKey is the identity). */
export async function enqueue(item: Omit<QueuedEval, "status" | "createdAt">): Promise<void> {
  const items = await readAll();
  if (items.some((i) => i.idempotencyKey === item.idempotencyKey)) return;
  items.push({ ...item, status: "pending", createdAt: Date.now() });
  await writeAll(items);
}

export async function list(): Promise<QueuedEval[]> {
  return readAll();
}

async function updateStatus(key: string, status: QueuedEvalStatus): Promise<void> {
  const items = await readAll();
  const next = items.map((i) => (i.idempotencyKey === key ? { ...i, status } : i));
  await writeAll(next);
}

export async function markSynced(key: string): Promise<void> {
  // Drop synced entries so the queue doesn't grow unbounded.
  const items = await readAll();
  await writeAll(items.filter((i) => i.idempotencyKey !== key));
}

export async function markFailed(key: string): Promise<void> {
  await updateStatus(key, "failed");
}

/**
 * Replay every pending/failed entry via `replay`. Entries that replay
 * successfully are removed; the rest are marked failed and left for a later
 * drain. `replay` should resolve on success and reject on any error.
 */
export async function drain(replay: (item: QueuedEval) => Promise<void>): Promise<void> {
  const items = await readAll();
  for (const item of items) {
    try {
      await replay(item);
      await markSynced(item.idempotencyKey);
    } catch {
      await markFailed(item.idempotencyKey);
    }
  }
}
