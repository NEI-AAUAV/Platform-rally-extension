/**
 * Holds a screen wake lock while `active` is true.
 *
 * Timing an activity means staring at a running clock without touching the
 * phone, so the screen locks after ~30s and the staff member has to unlock to
 * see the time — the one place this app behaves unmistakably like a web page.
 *
 * The lock is released automatically by the browser whenever the page is
 * hidden, so it is re-acquired on the way back to visible; releasing on
 * deactivate is what stops it from burning battery once the clock is stopped.
 *
 * Chrome/Android only in practice; Safari has no Screen Wake Lock API, where
 * this is an inert no-op.
 */
import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = (navigator as Navigator & WakeLockNavigator).wakeLock;
    if (!active || !api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        const next = await api.request("screen");
        // Deactivated (or unmounted) while the request was in flight.
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
      } catch (error) {
        // Denied — backgrounded tab, battery saver, or an unsupported surface.
        // Nothing to fall back to; the screen just behaves as before.
        logger.warn("Screen wake lock refused", { error });
      }
    };

    // The browser drops the lock on hide; re-take it when the app returns.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [active]);
}
