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
import { initSentry } from "@/lib/sentry";
import { registerSW } from "virtual:pwa-register";

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

// Register the Workbox service worker (generated from src/sw.ts by
// vite-plugin-pwa). autoUpdate reloads to activate a new SW automatically,
// preserving the old force-update behavior.
registerSW({ immediate: true });

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
