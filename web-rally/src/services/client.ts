import config from "@/config";
import { getTeamToken, setTeamToken, clearTeamAuth } from "@/lib/auth/tokenStore";

/**
 * HTTP auth glue for the generated OpenAPI client.
 *
 * Application requests go through the generated fetch client (src/client),
 * which reads the current staff/team token via OpenAPI.HEADERS (configured in
 * main.tsx). This module owns the two things that client cannot express:
 *
 * - {@link refreshTeamToken}: renew a team session using the team token
 *   explicitly, even when a staff token is also present (so it can't rely on
 *   OpenAPI.HEADERS, which prefers the staff token).
 * - {@link setOnUnauthorized}: a hook the OIDC layer registers to re-login when
 *   a staff request hits an unrecoverable 401.
 */

/**
 * Handler invoked when a staff request gets a 401 and cannot be recovered with
 * a token refresh. Registered by useAuthSync to trigger an OIDC re-login.
 */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Invoke the registered staff-401 handler, if any (used by the query cache). */
export function notifyUnauthorized(): void {
  onUnauthorized?.();
}

/**
 * Refresh the team access token using the Rally team-auth refresh endpoint.
 *
 * Sent with the team token explicitly so it works even when a staff token is
 * present. Staff tokens are NOT refreshed here: staff auth is owned by
 * react-oidc-context (authentik), which renews tokens silently and, on a hard
 * 401, re-authenticates via {@link setOnUnauthorized}.
 *
 * @returns the new team token, or undefined when there is no team session / it failed.
 */
export async function refreshTeamToken(): Promise<string | undefined> {
  const teamToken = getTeamToken();
  if (!teamToken) return undefined;

  try {
    const response = await fetch(`${config.BASE_URL}/api/rally/v1/team-auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    if (!response.ok) {
      throw new Error(`Team token refresh failed: ${response.status}`);
    }
    const { access_token } = (await response.json()) as { access_token: string };
    setTeamToken(access_token);
    return access_token;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Team token refresh failed:", error);
    }
    clearTeamAuth();
    return undefined;
  }
}
