import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useLocation } from "react-router-dom";

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
  const { pathname, search, hash } = useLocation();

  return useCallback(() => {
    sessionStorage.setItem("rally_auth_return_url", pathname + search + hash);
    void auth.signinRedirect();
  }, [auth, pathname, search, hash]);
}
