import { useEffect } from "react";
import { clearAppBadge } from "@/lib/appBadge";

/**
 * Mirrors native iOS: the badge clears once the user actually reopens the
 * app, not the instant the underlying unread event happens.
 */
export function useClearBadgeOnFocus(): void {
  useEffect(() => {
    clearAppBadge();

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        clearAppBadge();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
}
