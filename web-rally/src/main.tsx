import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import Router from "@/router";
import "@/styles/global.css";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notifyUnauthorized, refreshTeamToken } from "./services/client";
import { ApiError } from "./services/apiClient";
import { useUserStore } from "@/stores/useUserStore";
import { ToastProvider } from "@/components/ui/toast";
import { oidcConfig } from "@/auth/oidcConfig";
import AuthSyncGate from "@/auth/AuthSyncGate";
import { ColorModeProvider } from "@/components/theme";

// Keep a returning team session alive on startup (staff sessions are owned by
// react-oidc-context, which restores them automatically).
refreshTeamToken();

/**
 * A staff request hit an unrecoverable 401: hand off to the OIDC layer to
 * re-authenticate. Only staff sessions redirect — team 401s are not handled
 * here (a team session has no IdP to bounce through). Centralised on the query
 * cache so the single generated client drives this, with no per-call wiring.
 */
function handleApiError(error: unknown): void {
  const isStaff = Boolean(useUserStore.getState().token);
  if (isStaff && error instanceof ApiError && error.status === 401) {
    notifyUnauthorized();
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

async function clearBrowserCache(): Promise<void> {
  if (!("caches" in window)) return;
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
  globalThis.location.reload();
}

function handleServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  const newWorker = registration.installing;
  if (!newWorker) return;
  newWorker.addEventListener("statechange", () => {
    if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
      // New service worker is available, force activation
      newWorker.postMessage({ action: "skipWaiting" });
      globalThis.location.reload();
    }
  });
}

// Register Service Worker for PWA functionality
if ("serviceWorker" in navigator) {
  globalThis.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/rally/sw.js")
      .then((registration) => {
        // Check for updates and force activation
        registration.addEventListener("updatefound", () => handleServiceWorkerUpdate(registration));

        // Add development utility to clear cache
        if (process.env.NODE_ENV === "development") {
          (globalThis as unknown as Record<string, () => void>).clearRallyCache = () => {
            navigator.serviceWorker.controller?.postMessage({ action: "clearCache" });
            void clearBrowserCache();
          };
        }
      })
      .catch(() => {
        // Service worker registration failed - app will still work without PWA features
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ColorModeProvider>
      <AuthProvider {...oidcConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthSyncGate>
            <ToastProvider>
              <Router />
            </ToastProvider>
          </AuthSyncGate>
        </QueryClientProvider>
      </AuthProvider>
    </ColorModeProvider>
  </React.StrictMode>,
);
