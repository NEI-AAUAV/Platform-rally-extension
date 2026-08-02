/**
 * Makes the system back gesture close an overlay instead of leaving the app.
 *
 * On Android, back is the universal dismiss: with a sheet, dialog or the QR
 * scanner open, a back swipe is expected to close it. Without this hook the
 * gesture goes straight to the router, which pops the *page* — in a standalone
 * PWA sitting on the first history entry that means the app closes outright.
 * The same gesture is Safari's edge swipe, so iOS gets the fix too.
 *
 * Mechanics: opening pushes a throwaway history entry at the current URL (so
 * the router sees no navigation), and back pops it, which is the signal to
 * dismiss. Closing by any other means (button, Escape, success) unwinds that
 * entry so the extra step never accumulates.
 *
 * Android's predictive-back animation is driven by the browser once the entry
 * exists; no extra API is needed here, and none is used, so support is
 * universal.
 */
import { useEffect, useRef } from "react";

const STATE_KEY = "rallyOverlay";

let nextOverlayId = 0;

export function useBackDismiss(isOpen: boolean, onDismiss: () => void): void {
  // Kept in a ref so an inline arrow from the caller does not re-run the effect
  // on every render — which would push a history entry per render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!isOpen || globalThis.window === undefined) return;

    const id = ++nextOverlayId;
    // Same URL, so TanStack Router resolves the same route and nothing
    // re-renders; only the history depth changes.
    globalThis.history.pushState(
      { ...globalThis.history.state, [STATE_KEY]: id },
      "",
      globalThis.location.href,
    );
    let entryLive = true;

    const onPopState = (event: PopStateEvent) => {
      // Only react to our own entry being popped. Another overlay closing (or
      // a real route change) must not dismiss this one.
      const state = event.state as Record<string, unknown> | null;
      if (state?.[STATE_KEY] === id) return;
      entryLive = false;
      onDismissRef.current();
    };

    globalThis.addEventListener("popstate", onPopState);
    return () => {
      globalThis.removeEventListener("popstate", onPopState);
      // Closed some other way (button, Escape, submit): drop the entry we
      // added, or the next back press would be swallowed doing nothing.
      if (
        entryLive &&
        (globalThis.history.state as Record<string, unknown> | null)?.[STATE_KEY] === id
      ) {
        globalThis.history.back();
      }
    };
  }, [isOpen]);
}
