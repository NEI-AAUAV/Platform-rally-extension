import { useCallback, useEffect, useState } from "react";
import { PushService } from "@/services/PushService";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/pushSubscription";

type PushStatus = "unsupported" | "unconfigured" | "denied" | "unsubscribed" | "subscribed";

/**
 * Web Push opt-in for the current device. Requires the caller to be logged
 * in (subscribe is user-scoped server-side) — the preferences page only
 * renders this when authenticated.
 *
 * iOS 16.4+ delivers real push, but *only* once the PWA is installed to the
 * Home Screen — `isPushSupported` gates on that so the toggle never appears
 * where it can't possibly work.
 */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("unsubscribed");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveStatus() {
      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }
      const publicKey = await PushService.getVapidPublicKey();
      if (!publicKey) {
        if (!cancelled) setStatus("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
    }

    void resolveStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      const publicKey = await PushService.getVapidPublicKey();
      if (!publicKey) {
        setStatus("unconfigured");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await PushService.subscribe(subscription.toJSON() as never);
      setStatus("subscribed");
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await PushService.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, subscribe, unsubscribe };
}
