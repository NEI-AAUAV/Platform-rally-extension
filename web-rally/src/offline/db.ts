/**
 * Shared IndexedDB handle for the offline queues.
 *
 * `evalQueue` and `arrivalQueue` both live in the `rally-offline` database.
 * idb-keyval's own `createStore` cannot express that: it opens the database
 * without a version (so, v1) and creates only its own object store in
 * `onupgradeneeded`. With two of them pointed at one database name, whichever
 * ran first created v1 carrying a single store; the second then found an
 * existing v1, got no upgrade event, and every transaction against its store
 * threw `NotFoundError: One of the specified object stores was not found`.
 *
 * So the open is centralized here at an explicit version that creates *both*
 * stores. Bumping past 1 also repairs devices already carrying the half-built
 * database: the upgrade fires and adds whichever store is missing, leaving the
 * queued items in the store that did get created untouched.
 *
 * The returned functions match idb-keyval's `UseStore` contract, so `get`/`set`
 * keep working unchanged. Opening is lazy — the module must stay importable
 * where `indexedDB` is absent (SSR, jsdom in tests).
 */
import type { UseStore } from "idb-keyval";

const DB_NAME = "rally-offline";
/** v1 = single store per opener (broken); v2 = both stores created together. */
const DB_VERSION = 2;

export const EVAL_STORE_NAME = "eval-queue";
export const ARRIVAL_STORE_NAME = "arrival-queue";

const STORE_NAMES = [EVAL_STORE_NAME, ARRIVAL_STORE_NAME] as const;

let dbPromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise === undefined) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open rally-offline"));
      // Another tab still holds the old version open, so the upgrade cannot
      // run. Reject rather than hang: callers treat a queue read failure as an
      // empty queue and retry on the next drain, by which time that tab is
      // usually gone.
      request.onblocked = () => {
        dbPromise = undefined;
        reject(new Error("rally-offline upgrade blocked by another open tab"));
      };
    }).catch((error: unknown) => {
      // Don't cache a rejected promise: a later drain should be able to retry.
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * Build an idb-keyval-compatible store accessor bound to one of this
 * database's object stores.
 */
export function createQueueStore(storeName: string): UseStore {
  return (txMode, callback) =>
    openDatabase().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}
