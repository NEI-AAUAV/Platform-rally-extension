import axios from "axios";
import { useUserStore } from "@/stores/useUserStore.ts";
import config from "@/config";
import { getTeamToken, setTeamToken, clearTeamAuth } from "@/lib/auth/tokenStore";

const UNAUTHORIZED = 401;

let isRefreshing = false;

let refreshSubscribers: ((token?: string) => void)[] = [];

/**
 * Handler invoked when a staff request gets a 401 and cannot be recovered with
 * a token refresh. Registered by useAuthSync to trigger an OIDC re-login.
 */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Add new pending request to wait for a new access token. */
function subscribeTokenRefresh(callback: (token?: string) => void) {
  refreshSubscribers.push(callback);
}

/** Resolve all pending requests with the new access token. */
function processQueue(token?: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

/** Get current token (either staff or team) */
function getCurrentToken(): { token: string; type: 'staff' | 'team' } | null {
  // Staff token (authentik access token, synced from react-oidc-context) is the
  // primary auth method.
  const staffToken = useUserStore.getState().token;
  if (staffToken) {
    return { token: staffToken, type: 'staff' };
  }

  // Fall back to team token ONLY if no staff token exists, so team tokens don't
  // interfere with staff authentication.
  const teamToken = getTeamToken();
  if (teamToken) {
    return { token: teamToken, type: 'team' };
  }

  return null;
}

/**
 * Refresh the team access token using the Rally team-auth refresh endpoint.
 *
 * Staff tokens are NOT refreshed here: staff auth is owned by react-oidc-context
 * (authentik), which renews tokens silently and, on a hard 401, re-authenticates
 * via {@link onUnauthorized}.
 *
 * @returns the new team token, or undefined when there is no team session / it failed.
 */
export async function refreshTeamToken(): Promise<string | undefined> {
  const teamToken = getTeamToken();
  if (!teamToken) return undefined;

  return axios
    .create({
      baseURL: config.BASE_URL,
      timeout: 5000,
      headers: { Authorization: `Bearer ${teamToken}` },
    })
    .post("/api/rally/v1/team-auth/refresh")
    .then(({ data: { access_token } }) => {
      setTeamToken(access_token);
      return access_token as string;
    })
    .catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Team token refresh failed:', error);
      }
      clearTeamAuth();
      return undefined;
    });
}

/**
 * Creates an axios client with authentication and error handling.
 *
 * Features:
 * - Automatic token injection in request headers (staff or team)
 * - Team-token refresh on 401; staff 401 triggers an OIDC re-login
 * - Request queue during team refresh to prevent duplicate refresh calls
 *
 * @param baseURL - Optional base URL for the API client
 * @returns Configured axios instance with interceptors
 */
export const createClient = (baseURL?: string) => {
  const client = axios.create({
    baseURL,
    timeout: 5000,
  });

  client.interceptors.request.use(
    (config) => {
      // Inject the appropriate access token in request header
      const currentAuth = getCurrentToken();
      if (currentAuth) {
        config.headers.Authorization = `Bearer ${currentAuth.token}`;
      }
      return config;
    },
    (error) => {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(errorObj);
    },
  );

  client.interceptors.response.use(
    (response) => response.data,
    async (error) => {
      const { response, config } = error;

      if (response?.status === UNAUTHORIZED && !config.retry) {
        const currentAuth = getCurrentToken();

        // Staff session: hand off to the OIDC layer for re-authentication.
        if (currentAuth?.type !== 'team') {
          onUnauthorized?.();
          return Promise.reject(new Error("Session Expired"));
        }

        // Team session: attempt a single team-token refresh, queueing concurrent
        // requests behind it.
        if (!isRefreshing) {
          isRefreshing = true;
          const token = await refreshTeamToken();
          processQueue(token);
          isRefreshing = false;

          if (token) {
            config.retry = true;
            return axios.request(config);
          }
          return Promise.reject(new Error("Session Expired"));
        }
        return new Promise((resolve) => {
          subscribeTokenRefresh((token?: string) => {
            config.headers.Authorization = `Bearer ${token}`;
            resolve(axios.request(config));
          });
        });
      }
      const errorObj = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(errorObj);
    },
  );
  return client;
};
