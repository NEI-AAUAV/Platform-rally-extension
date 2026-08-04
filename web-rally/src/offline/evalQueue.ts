/**
 * Durable offline queue for staff evaluation submits.
 *
 * Staff evaluate on phones over flaky venue wifi. When a submit fails because
 * the device is offline (or the network drops mid-request), it is persisted
 * here in IndexedDB and replayed when connectivity returns. Each entry carries
 * a stable `idempotencyKey` so replays are recognized by the backend as
 * duplicates rather than re-applying the score.
 *
 * Backed by idb-keyval (a single IndexedDB store). The foreground drain in
 * useOfflineSync is the mechanism on every platform, because iOS Safari — where
 * much of the staff runs — has no Background Sync at all. Where Background Sync
 * does exist it is registered as a supplement (see requestBackgroundSync), so
 * Chrome can also replay after the app is closed; nothing depends on it firing.
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

/** Tag the service worker listens for; see the `sync` handler in src/sw.ts. */
export const EVAL_SYNC_TAG = "rally-eval-queue";

/**
 * Best-effort Background Sync registration. Absent on iOS Safari and on any
 * browser without the API, in which case this resolves silently and the
 * foreground drain remains the only path — as it already was.
 */
async function requestBackgroundSync(): Promise<void> {
  if (globalThis.navigator?.serviceWorker === undefined) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    ).sync;
    await sync?.register(EVAL_SYNC_TAG);
  } catch {
    // Permission denied, or the browser refused the registration. The queue is
    // already persisted, so the next foreground drain still picks it up.
  }
}

/** Append a submit to the queue (idempotencyKey is the identity). */
export async function enqueue(item: Omit<QueuedEval, "status" | "createdAt">): Promise<void> {
  const items = await readAll();
  if (items.some((i) => i.idempotencyKey === item.idempotencyKey)) return;
  items.push({ ...item, status: "pending", createdAt: Date.now() });
  await writeAll(items);
  await requestBackgroundSync();
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
