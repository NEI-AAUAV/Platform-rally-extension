import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useLocation } from "@tanstack/react-router";

/**
 * Returns a staff-login trigger. Starts the authentik PKCE flow and remembers
 * the current page so the user returns here after authenticating.
 *
 * @example
 * ```tsx
 * const onStaffLogin = useStaffLogin();
 * <button onClick={onStaffLogin}>Login Staff</button>
 * ```
 */
export default function useStaffLogin(): () => void {
  const auth = useAuth();
  // TanStack's ParsedLocation.href is the relative path incl. search + hash.
  const { href } = useLocation();

  return useCallback(() => {
    sessionStorage.setItem("rally_auth_return_url", href);
    void auth.signinRedirect();
  }, [auth, href]);
}
