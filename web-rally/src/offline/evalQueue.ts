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
import { update } from "idb-keyval";
import { createQueueStore, EVAL_STORE_NAME } from "./db";
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
  /** Consecutive network-error retries. Caps at MAX_NETWORK_ATTEMPTS. */
  attempts: number;
  /** Human-readable reason for the most recent failure, shown to staff. */
  lastError?: string;
}

const STORE = createQueueStore(EVAL_STORE_NAME);
const QUEUE_KEY = "queue";

/** After this many network-error retries, an entry is marked failed too —
 * an item that can never reach the server (device/venue-wide outage) must
 * not retry silently forever without ever surfacing to staff. */
const MAX_NETWORK_ATTEMPTS = 10;

async function readAll(): Promise<QueuedEval[]> {
  return (await update<QueuedEval[] | undefined>(QUEUE_KEY, (v) => v, STORE)) ?? [];
}

/** Fired whenever the queue's contents change, so UI can refresh without polling. */
export const QUEUE_CHANGED_EVENT = "rally-offline-queue-changed";

function notifyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  }
}

/**
 * Atomic read-modify-write via idb-keyval's `update`, which runs the updater
 * inside a single IndexedDB transaction. The previous readAll()+writeAll()
 * pair raced: an `enqueue` interleaved with a `drain`'s per-item writeAll
 * could observe and persist a stale snapshot, silently dropping the other
 * call's change.
 */
async function mutate(fn: (items: QueuedEval[]) => QueuedEval[]): Promise<void> {
  await update<QueuedEval[] | undefined>(QUEUE_KEY, (v) => fn(v ?? []), STORE);
  notifyChanged();
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
export async function enqueue(
  item: Omit<QueuedEval, "status" | "createdAt" | "attempts" | "lastError">,
): Promise<void> {
  await mutate((items) => {
    if (items.some((i) => i.idempotencyKey === item.idempotencyKey)) return items;
    return [...items, { ...item, status: "pending", createdAt: Date.now(), attempts: 0 }];
  });
  await requestBackgroundSync();
}

export async function list(): Promise<QueuedEval[]> {
  return readAll();
}

export async function markSynced(key: string): Promise<void> {
  // Drop synced entries so the queue doesn't grow unbounded.
  await mutate((items) => items.filter((i) => i.idempotencyKey !== key));
}

/** Permanently failed: the server rejected the request itself (4xx/5xx), or
 * a network retry exhausted its budget. Not retried by future drains. */
export async function markFailed(key: string, reason: string): Promise<void> {
  await mutate((items) =>
    items.map((i) =>
      i.idempotencyKey === key ? { ...i, status: "failed", lastError: reason } : i,
    ),
  );
}

/** Bumps the retry counter for a transient network failure; still `pending`
 * so the next drain picks it up again, unless the retry budget is spent. */
async function markNetworkRetry(key: string, reason: string): Promise<void> {
  await mutate((items) =>
    items.map((i) => {
      if (i.idempotencyKey !== key) return i;
      const attempts = i.attempts + 1;
      return attempts >= MAX_NETWORK_ATTEMPTS
        ? { ...i, status: "failed" as const, attempts, lastError: reason }
        : { ...i, attempts, lastError: reason };
    }),
  );
}

/** Re-queues a permanently-failed entry for another drain attempt. */
export async function retryFailed(key: string): Promise<void> {
  await mutate((items) =>
    items.map((i) =>
      i.idempotencyKey === key
        ? { ...i, status: "pending" as const, attempts: 0, lastError: undefined }
        : i,
    ),
  );
}

/** Discards an entry outright — staff acknowledging a submit is lost and
 * will be re-entered manually, rather than retried forever. */
export async function discard(key: string): Promise<void> {
  await mutate((items) => items.filter((i) => i.idempotencyKey !== key));
}

/** True for a `fetch` failure before any HTTP response was received
 * (offline, DNS failure, connection reset) — the browser surfaces these as a
 * TypeError, unlike a parsed HTTP error body (see client.gen.ts), which is a
 * plain object with no Error prototype. Retry these; never retry the other
 * kind, since the server already told us definitively what it thinks. */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function describeError(error: unknown): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  if (error instanceof Error) return error.message;
  return "Erro desconhecido do servidor";
}

/**
 * Replay every `pending` entry via `replay`. A successful replay removes the
 * entry. A network failure (no response reached) leaves it `pending` for the
 * next drain, up to MAX_NETWORK_ATTEMPTS. Any other failure — the server
 * responded, so retrying without a code change would fail identically — marks
 * it permanently `failed` with a reason, and it is not retried by future
 * drains until staff explicitly retryFailed() it.
 *
 * `failed` entries are intentionally skipped here: the old behavior replayed
 * *every* entry regardless of status, so a permanent 4xx (staff scoring
 * disabled, a validation error) retried on every drain forever while staff
 * saw only "guardada, será sincronizada" with no path to notice or recover.
 */
export async function drain(replay: (item: QueuedEval) => Promise<void>): Promise<void> {
  const items = await readAll();
  for (const item of items.filter((i) => i.status === "pending")) {
    try {
      await replay(item);
      await markSynced(item.idempotencyKey);
    } catch (error) {
      const reason = describeError(error);
      if (isNetworkError(error)) {
        await markNetworkRetry(item.idempotencyKey, reason);
      } else {
        await markFailed(item.idempotencyKey, reason);
      }
    }
  }
}
