import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useUserStore } from "@/stores/useUserStore";

/**
 * Full sign-out: clears the local rally session AND ends the OIDC session.
 *
 * M10 regression: the "Sair" button used to call only `useUserStore`'s
 * `logout()`, which drops `rally_token`/`rally_team_token` from
 * localStorage but never touches `oidc.user:*` — the key `oidc-client-ts`
 * uses for its `WebStorageStateStore` (`oidcConfig.ts`), which holds the
 * access token *and refresh token*. That key survived, so a page reload
 * silently re-authenticated the "logged out" session from it
 * (`useAuthSync`'s sync effect just re-reads `auth.user`), and the
 * Authentik SSO session itself was never ended — `post_logout_redirect_uri`
 * was configured and never used for anything.
 *
 * `removeUser()` clears that local oidc-client-ts state; `signoutRedirect()`
 * then ends the IdP session and returns the browser to
 * `post_logout_redirect_uri`. If the IdP round trip fails (network, RP-logout
 * not configured on that Authentik application), the local session is
 * already gone either way — log and continue rather than leaving the UI in a
 * half-logged-out state.
 */
export function useLogout(): () => Promise<void> {
  const auth = useAuth();
  const storeLogout = useUserStore((state) => state.logout);

  return useCallback(async () => {
    storeLogout();
    try {
      await auth.removeUser();
      await auth.signoutRedirect();
    } catch (error: unknown) {
      console.warn("OIDC signout failed; local session was already cleared.", error);
    }
  }, [auth, storeLogout]);
}
