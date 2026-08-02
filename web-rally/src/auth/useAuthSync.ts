import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";

import { useUserStore } from "@/stores/useUserStore";
import { setOnUnauthorized } from "@/services/client";
import { setResumeValue } from "@/lib/authResumeStore";
import { profileToUser } from "./identity";

/**
 * Bridge react-oidc-context state into the rally user store and the API client.
 *
 * - Pushes the authentik access token + mapped identity into useUserStore so
 *   OpenAPI.HEADERS authenticates the generated client's requests.
 * - On a 401 from the API, redirects to the identity provider for a fresh
 *   token (the IdP session is usually still valid, so this is near-instant).
 *
 * Must be rendered inside <AuthProvider>.
 */
export function useAuthSync() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const setSession = useUserStore((state) => state.setSession);
  const clearSession = useUserStore((state) => state.clearSession);

  const isHandling401 = useRef(false);

  // Sync the OIDC session into the user store whenever it changes.
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !auth.user.expired) {
      setSession({ token: auth.user.access_token, user: profileToUser(auth.user) });
    } else if (!auth.isLoading) {
      clearSession();
    }
  }, [auth.isAuthenticated, auth.user, auth.isLoading, setSession, clearSession]);

  // On 401, redirect to the IdP for a fresh token.
  const handleUnauthorized = useCallback(async () => {
    if (isHandling401.current) return;
    isHandling401.current = true;

    await queryClient.cancelQueries();
    queryClient.clear();
    clearSession();

    // Return to the current page after re-authentication.
    setResumeValue(
      "rally_auth_return_url",
      globalThis.location.pathname + globalThis.location.search,
    );
    await auth.signinRedirect();
  }, [auth, queryClient, clearSession]);

  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
    return () => setOnUnauthorized(null);
  }, [handleUnauthorized]);

  // Reset the guard once the user re-authenticates.
  useEffect(() => {
    if (auth.isAuthenticated) {
      isHandling401.current = false;
    }
  }, [auth.isAuthenticated]);

  return auth;
}
