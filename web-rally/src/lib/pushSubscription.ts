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

/** True only where Web Push can actually fire: standard support, plus on iOS
 * specifically the PWA must be running installed to the Home Screen — a
 * plain Safari tab never delivers `push` events, even after 16.4. */
export function isPushSupported(): boolean {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIOS) return true;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandalone;
}
