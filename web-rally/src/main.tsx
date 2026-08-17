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
import { ColorModeProvider, GlassFilters } from "@/components/theme";
import { initSentry } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import PWAAppGate from "@/components/pwa/PWAAppGate";
import PWAUpdatePrompt from "@/components/pwa/PWAUpdatePrompt";
import { MotionConfig } from "framer-motion";

// Error tracking — no-op unless VITE_SENTRY_DSN is set. Before app render so
// early exceptions are captured.
initSentry();

// Keep a returning team session alive on startup (staff sessions are owned by
// react-oidc-context, which restores them automatically).
void refreshTeamToken();

/**
 * A staff request hit an unrecoverable 401: hand off to the OIDC layer to
 * re-authenticate. Only staff sessions redirect — team 401s are not handled
 * here (a team session has no IdP to bounce through). Centralised on the query
 * cache so the single generated client drives this, with no per-call wiring.
 *
 * Also the single choke point for reporting API failures: 5xx and network
 * errors are captured (they're unexpected); 4xx are left unreported as
 * expected validation noise, except 401/403 which become breadcrumbs so
 * they show up as context on a later captured error.
 */
function handleApiError(error: unknown): void {
  const isStaff = Boolean(useUserStore.getState().token);
  if (isStaff && error instanceof ApiError && error.status === 401) {
    notifyUnauthorized();
  }

  if (!(error instanceof ApiError)) {
    logger.error("Network error", error);
    return;
  }
  if (error.status === 0 || error.status >= 500) {
    logger.error("API request failed", error, { status: error.status, requestId: error.requestId });
  } else if (error.status === 401 || error.status === 403) {
    logger.warn("API auth error", { status: error.status, requestId: error.requestId });
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

// The Workbox service worker (generated from src/sw.ts by vite-plugin-pwa) is
// registered by PWAUpdatePrompt via useRegisterSW, which also owns the
// "new version available" state. It is mounted outside PWAAppGate so
// registration is not held up by the boot connectivity check.

// Ask iOS/Chrome not to evict this origin's cache/IndexedDB under storage
// pressure. Best-effort — unsupported or denied silently, no UX depends on it.
void navigator.storage?.persist?.().then((granted) => {
  if (!granted) logger.warn("Persistent storage not granted");
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* The CSS layer honours prefers-reduced-motion, but framer-motion runs its
        animations in JS and ignores the preference unless told to. Without this
        a user who has asked for reduced motion still gets every entrance
        transition. */}
    <MotionConfig reducedMotion="user">
      <ColorModeProvider>
        <GlassFilters />
        <PWAUpdatePrompt />
        <PWAAppGate>
          <AuthProvider {...oidcConfig}>
            <QueryClientProvider client={queryClient}>
              <AuthSyncGate>
                <ToastProvider>
                  <Router />
                </ToastProvider>
              </AuthSyncGate>
            </QueryClientProvider>
          </AuthProvider>
        </PWAAppGate>
      </ColorModeProvider>
    </MotionConfig>
  </React.StrictMode>,
);
