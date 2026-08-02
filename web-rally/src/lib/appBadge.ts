/**
 * The Badging API as this module needs to see it: every member optional,
 * because it is missing at runtime on most non-Chromium browsers and is a
 * silent no-op on iOS.
 *
 * Deliberately not `extends Navigator` — current lib.dom.d.ts declares
 * setAppBadge/clearAppBadge as *required* members, so an interface that
 * re-declares them as optional is not a valid extension of it (TS2430).
 * Modelling the shape independently keeps the optional-at-runtime contract,
 * which is the one the call sites below actually guard against.
 */
interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
  serviceWorker?: Navigator["serviceWorker"];
}

function getBadgeNavigator(): BadgeNavigator | null {
  if (typeof navigator === "undefined") return null;
  return navigator as BadgeNavigator;
}

export function setAppBadge(count: number): void {
  const nav = getBadgeNavigator();
  if (!nav?.setAppBadge) return;

  if (count <= 0) {
    nav.clearAppBadge?.().catch(() => {});
    return;
  }

  nav.setAppBadge(count).catch(() => {});
}

export function clearAppBadge(): void {
  const nav = getBadgeNavigator();
  if (!nav) return;
  nav.clearAppBadge?.().catch(() => {});
  nav.serviceWorker?.controller?.postMessage({ action: "clearBadge" });
}
