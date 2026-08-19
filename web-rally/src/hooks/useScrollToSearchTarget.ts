/**
 * Scrolls to and briefly highlights a `[data-admin-search-key]` element once
 * it exists in the DOM.
 *
 * The target usually isn't there yet on the render that requests it — picking
 * a search result also switches tab/section, and that swap hasn't committed.
 * So this polls a few times instead of assuming the DOM is already caught up,
 * and gives up quietly if the field never renders (e.g. still gated behind a
 * switch the caller didn't flip).
 */
import { useEffect } from "react";

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 50;
const HIGHLIGHT_DURATION_MS = 1500;
const HIGHLIGHT_CLASS = "rally-search-highlight";

export function useScrollToSearchTarget(pendingKey: string | null, onDone: () => void): void {
  useEffect(() => {
    if (!pendingKey) return;

    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tryScroll = () => {
      const el = document.querySelector(`[data-admin-search-key="${pendingKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
        onDone();
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        timeoutId = setTimeout(tryScroll, RETRY_DELAY_MS);
      } else {
        onDone();
      }
    };

    const raf = requestAnimationFrame(tryScroll);
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);
}
