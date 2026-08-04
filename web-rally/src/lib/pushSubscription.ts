/** Browsers want the VAPID key as a Uint8Array, servers hand it out base64url. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * Where src/sw.ts parks a subscription it re-created after the browser rotated
 * the endpoint (`pushsubscriptionchange`). The SW cannot register it: the
 * /push/subscribe endpoint is user-scoped and the token lives in the page.
 */
const PENDING_SUB_CACHE = "rally-push-pending";
const PENDING_SUB_KEY = "https://rally.push/pending-subscription";

/** The rotated subscription waiting to be registered, if any. */
export async function takePendingSubscription(): Promise<PushSubscriptionJSON | null> {
  if (globalThis.caches === undefined) return null;
  try {
    const cache = await caches.open(PENDING_SUB_CACHE);
    const stored = await cache.match(PENDING_SUB_KEY);
    if (!stored) return null;
    const parsed = (await stored.json()) as PushSubscriptionJSON;
    // Cleared only after a successful read; the caller deletes nothing on a
    // failed POST, so a network error just leaves it for the next launch.
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the parked subscription once the server has accepted it. */
export async function clearPendingSubscription(): Promise<void> {
  if (globalThis.caches === undefined) return;
  try {
    const cache = await caches.open(PENDING_SUB_CACHE);
    await cache.delete(PENDING_SUB_KEY);
  } catch {
    // Nothing to clean up, or storage is gone. Harmless: re-registering the
    // same endpoint is an upsert server-side.
  }
}

/** True only where Web Push can actually fire: standard support, plus on iOS
 * specifically the PWA must be running installed to the Home Screen — a
 * plain Safari tab never delivers `push` events, even after 16.4. */
export function isPushSupported(): boolean {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIOS) return true;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandalone;
}
