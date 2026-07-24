import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useLocation } from "@tanstack/react-router";

/**
 * Returns a staff-login trigger. Starts the authentik PKCE flow and remembers
 * the current page so the user returns here after authenticating.
 *
 * Pass `mode: "registration"` to land the user on authentik's registration
 * flow instead of the login form (authentik honors `prompt=registration`).
 *
 * @example
 * ```tsx
 * const onStaffLogin = useStaffLogin();
 * <button onClick={() => onStaffLogin({ mode: "registration" })}>Registar</button>
 * ```
 */
export default function useStaffLogin(): (opts?: { mode?: "login" | "registration" }) => void {
  const auth = useAuth();
  // TanStack's ParsedLocation.href is the relative path incl. search + hash.
  const { href } = useLocation();

  return useCallback(
    (opts?: { mode?: "login" | "registration" }) => {
      sessionStorage.setItem("rally_auth_return_url", href);
      void auth.signinRedirect(
        opts?.mode === "registration"
          ? { extraQueryParams: { prompt: "registration" } }
          : undefined,
      );
    },
    [auth, href],
  );
}
