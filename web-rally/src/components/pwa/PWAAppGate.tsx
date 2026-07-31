import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { viewRallySettingsPublic } from "@/client";
import { logger } from "@/lib/logger";
import { useClearBadgeOnFocus } from "@/hooks/useClearBadgeOnFocus";
import PWALoadingScreen from "./PWALoadingScreen";
import PWAConnectionError from "./PWAConnectionError";

const HEALTH_CHECK_TIMEOUT_MS = 6000;

type ConnectionStatus = "checking" | "online" | "offline";

/**
 * Pings a real public endpoint under `/api/rally/...` rather than the raw
 * `/health` route: the gateway only proxies `/api/rally` and `/static/rally`
 * to the backend (see deploy/nginx/rally.conf) — `/health` is an internal
 * Docker healthcheck path that 404s from the browser even when the API is up.
 *
 * Reachability is judged on whether a response was received at all, not on
 * its status: a 401/403/500 still means the server is up and answering — only
 * a network-level failure (no `response`, e.g. timeout, DNS, connection
 * refused) means the backend is actually unreachable.
 */
async function pingBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const { response } = await viewRallySettingsPublic({
      signal: controller.signal,
      throwOnError: false,
    });
    return Boolean(response);
  } catch (err) {
    logger.warn("Backend connectivity check failed", {
      error: err instanceof Error ? err.message : err,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** True when a service worker is actively controlling this page. */
function hasServiceWorker(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller);
}

/**
 * Boot gate for the PWA: shows an animated loader while the backend health
 * check runs, then renders the app — or, only when nothing is cached to fall
 * back to, a full-screen connection-error state with retry. Also reacts to the browser's own online/offline events so
 * a device going offline mid-session surfaces immediately, not just at boot.
 */
export default function PWAAppGate({ children }: Readonly<{ children: ReactNode }>) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);

  useClearBadgeOnFocus();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(async () => {
    const isReachable = await pingBackend();
    if (!mounted.current) return isReachable;
    setStatus(isReachable ? "online" : "offline");
    return isReachable;
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const handleOffline = () => setStatus("offline");
    const handleOnline = () => void check();
    globalThis.addEventListener("offline", handleOffline);
    globalThis.addEventListener("online", handleOnline);
    return () => {
      globalThis.removeEventListener("offline", handleOffline);
      globalThis.removeEventListener("online", handleOnline);
    };
  }, [check]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    await check();
    if (mounted.current) setRetrying(false);
  }, [check]);

  if (status === "checking") {
    return <PWALoadingScreen />;
  }

  // A controlling service worker means the app shell and the NetworkFirst API
  // cache are already on the device, so an unreachable backend is a degraded
  // state, not a dead end — render the app and let the in-app offline banner
  // (useOfflineSync) explain it. The hard error screen is reserved for the case
  // where there is no cached app at all to fall back to.
  if (status === "offline" && !hasServiceWorker()) {
    return <PWAConnectionError onRetry={handleRetry} retrying={retrying} />;
  }

  return <>{children}</>;
}
