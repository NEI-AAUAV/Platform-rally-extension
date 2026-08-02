/**
 * Registers a push subscription that the service worker had to re-create.
 *
 * Chrome rotates push endpoints (expiry, key rotation, storage pressure) and
 * fires `pushsubscriptionchange`. The SW re-subscribes immediately, but it
 * cannot tell the server: /push/subscribe is user-scoped and the bearer token
 * lives in the page. So it parks the new subscription and this hook registers
 * it. Until that happens the server is still sending to the dead endpoint and
 * every notification silently 410s.
 *
 * Mounted app-wide (PWAAppGate) rather than on the preferences page, because
 * the rotation usually happens while the app is closed and the user has no
 * reason to open settings afterwards.
 */
import { useEffect } from "react";
import { PushService } from "@/services/PushService";
import { clearPendingSubscription, takePendingSubscription } from "@/lib/pushSubscription";
import { logger } from "@/lib/logger";

export function useRotatedPushSync(): void {
  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const pending = await takePendingSubscription();
      if (!pending || cancelled) return;
      try {
        await PushService.subscribe(pending as never);
        await clearPendingSubscription();
      } catch (error) {
        // Offline, or the session isn't restored yet on a cold start. The
        // subscription stays parked and is retried below rather than lost.
        logger.warn("Could not register rotated push subscription", { error });
      }
    }

    void sync();

    const onSwMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        void sync();
      }
    };
    // Retry point for the cold-start case above: by the time the app is
    // foregrounded again the session is restored. No-ops when nothing is
    // parked, which is almost always.
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
