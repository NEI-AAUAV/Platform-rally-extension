/**
 * Push opt-in was at 0% coverage. Each status this hook can land in maps to a
 * different thing the preferences UI shows the user, and getting one wrong
 * means either a dead toggle or a toggle that silently never subscribes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const getVapidPublicKey = vi.fn();
const pushSubscribe = vi.fn();
const pushUnsubscribe = vi.fn();
vi.mock("@/services/PushService", () => ({
  PushService: {
    getVapidPublicKey: () => getVapidPublicKey(),
    subscribe: (sub: unknown) => pushSubscribe(sub),
    unsubscribe: (endpoint: string) => pushUnsubscribe(endpoint),
  },
}));

const isPushSupported = vi.fn();
vi.mock("@/lib/pushSubscription", () => ({
  isPushSupported: () => isPushSupported(),
  urlBase64ToUint8Array: (key: string) => new Uint8Array([key.length]),
}));

import { usePushNotifications } from "@/hooks/usePushNotifications";

const subscriptionJSON = { endpoint: "https://push.example/abc" };

function installServiceWorker(existingSubscription: unknown) {
  const subscribe = vi.fn().mockResolvedValue({
    toJSON: () => subscriptionJSON,
    endpoint: subscriptionJSON.endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
  });
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existingSubscription),
      subscribe,
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration) },
    writable: true,
    configurable: true,
  });
  return { registration, subscribe };
}

function setPermission(permission: NotificationPermission, requested = permission) {
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue(requested),
  });
}

describe("usePushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    isPushSupported.mockReturnValue(true);
    getVapidPublicKey.mockResolvedValue("BKxDefinitelyAKey");
    setPermission("default");
    installServiceWorker(null);
  });

  describe("initial status", () => {
    it("reports unsupported where push cannot fire (e.g. iOS Safari tab)", async () => {
      isPushSupported.mockReturnValue(false);

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.status).toBe("unsupported"));
      expect(getVapidPublicKey).not.toHaveBeenCalled();
    });

    it("reports unconfigured when the server has no VAPID key", async () => {
      getVapidPublicKey.mockResolvedValue(null);

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.status).toBe("unconfigured"));
    });

    it("reports denied when the user has already blocked notifications", async () => {
      setPermission("denied");

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.status).toBe("denied"));
    });

    it("reports subscribed when this device already has a subscription", async () => {
      installServiceWorker({ endpoint: subscriptionJSON.endpoint });

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.status).toBe("subscribed"));
    });

    it("reports unsubscribed when supported and configured but not yet opted in", async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.status).toBe("unsubscribed"));
    });
  });

  describe("subscribe", () => {
    it("registers the subscription with the server and becomes subscribed", async () => {
      const { subscribe } = installServiceWorker(null);
      setPermission("default", "granted");

      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

      await act(async () => {
        await result.current.subscribe();
      });

      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ userVisibleOnly: true }),
      );
      expect(pushSubscribe).toHaveBeenCalledWith(subscriptionJSON);
      expect(result.current.status).toBe("subscribed");
      expect(result.current.loading).toBe(false);
    });

    it("goes to denied and never calls the server when permission is refused", async () => {
      setPermission("default", "denied");

      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.status).toBe("denied");
      expect(pushSubscribe).not.toHaveBeenCalled();
    });

    it("clears the loading flag even when subscribing throws", async () => {
      setPermission("default", "granted");
      pushSubscribe.mockRejectedValue(new Error("500"));

      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

      await act(async () => {
        await expect(result.current.subscribe()).rejects.toThrow("500");
      });

      // A stuck spinner would leave the preferences toggle permanently disabled.
      expect(result.current.loading).toBe(false);
    });
  });

  describe("unsubscribe", () => {
    it("tells the server and drops the browser subscription", async () => {
      const browserSub = {
        endpoint: subscriptionJSON.endpoint,
        unsubscribe: vi.fn().mockResolvedValue(true),
      };
      installServiceWorker(browserSub);

      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.status).toBe("subscribed"));

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(pushUnsubscribe).toHaveBeenCalledWith(subscriptionJSON.endpoint);
      expect(browserSub.unsubscribe).toHaveBeenCalled();
      expect(result.current.status).toBe("unsubscribed");
    });

    it("is a no-op against the server when there is nothing subscribed", async () => {
      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(pushUnsubscribe).not.toHaveBeenCalled();
      expect(result.current.status).toBe("unsubscribed");
    });
  });
});
