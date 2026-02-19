import axios from "axios";
import { useUserStore } from "@/stores/useUserStore.ts";
import config from "@/config";

const UNAUTHORIZED = 401;
const TEAM_TOKEN_KEY = "rally_team_token";
const TEAM_DATA_KEY = "rally_team_data";

let isRefreshing = false;

let refreshSubscribers: ((token?: string) => void)[] = [];

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
  // Check for staff token first - this is the primary auth method
  const staffToken = useUserStore.getState().token;
  if (staffToken) {
    return { token: staffToken, type: 'staff' };
  }

  // Fall back to team token ONLY if no staff token exists
  // This ensures team tokens don't interfere with staff authentication
  const teamToken = localStorage.getItem(TEAM_TOKEN_KEY);
  if (teamToken) {
    return { token: teamToken, type: 'team' };
  }

  return null;
}



/**
 * Attempts to refresh the authentication token using the appropriate refresh endpoint
 *
 * For staff tokens (NEI): Always attempts the NEI refresh endpoint, which relies on
 * the HttpOnly refresh cookie set by the NEI backend. This correctly handles two cases:
 *   1. Existing staff session: rally_token already in localStorage, refresh keeps it alive.
 *   2. New login from NEI: user was redirected back from NEI login with a refresh cookie
 *      but rally_token is not yet in localStorage — the cookie alone is sufficient.
 *
 * For team tokens: Uses the Rally team-auth refresh endpoint with the Bearer token.
 *
 * Implements a queue system to handle concurrent refresh requests.
 *
 * @returns Promise resolving to the new access token, or undefined if refresh fails
 * @throws Does not throw, but returns undefined on failure
 *
 * @example
 * ```ts
 * const token = await refreshToken();
 * if (token) {
 *   // Token refreshed successfully
 * }
 * ```
 */
export async function refreshToken() {
  const currentAuth = getCurrentToken();

  // Always attempt the NEI staff refresh — it relies on the HttpOnly cookie,
  // so it works even when no staff token is in localStorage yet.
  // Run it in parallel with the team refresh when both tokens exist.
  const teamToken = localStorage.getItem(TEAM_TOKEN_KEY);

  const neiRefreshPromise = axios
    .create({
      baseURL: config.API_NEI_URL,
      timeout: 5000,
      headers: currentAuth?.token
        ? { Authorization: `Bearer ${currentAuth.token}` }
        : {},
    })
    .post("/auth/refresh/")
    .then(({ data: { access_token } }) => {
      useUserStore.getState().login({ token: access_token });
      return access_token as string;
    })
    .catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Staff token refresh failed:', error);
      }
      // Only explicitly logout if there was a known staff session that failed.
      if (currentAuth?.type === 'staff') {
        useUserStore.getState().logout();
      }
      return undefined;
    });

  // If there is a team token, refresh it in parallel.
  if (teamToken) {
    const teamRefreshPromise = axios
      .create({
        baseURL: config.BASE_URL,
        timeout: 5000,
        headers: { Authorization: `Bearer ${teamToken}` },
      })
      .post("/api/rally/v1/team-auth/refresh")
      .then(({ data: { access_token } }) => {
        localStorage.setItem(TEAM_TOKEN_KEY, access_token);
        return access_token as string;
      })
      .catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Team token refresh failed:', error);
        }
        localStorage.removeItem(TEAM_TOKEN_KEY);
        localStorage.removeItem(TEAM_DATA_KEY);
        return undefined;
      });

    // Wait for both — return the staff token (primary auth)
    const [staffToken] = await Promise.all([neiRefreshPromise, teamRefreshPromise]);
    return staffToken;
  }

  // No team token — just return the NEI refresh result
  return neiRefreshPromise;
}



/**
 * Creates an axios client with authentication and error handling
 * 
 * Features:
 * - Automatic token injection in request headers (staff or team)
 * - Automatic token refresh on 401 errors using appropriate endpoint
 * - Request queue during token refresh to prevent duplicate refresh calls
 * - Automatic logout on refresh failure
 * 
 * @param baseURL - Optional base URL for the API client
 * @returns Configured axios instance with interceptors
 * 
 * @example
 * ```ts
 * const client = createClient('https://api.example.com');
 * const data = await client.get('/endpoint');
 * ```
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
      // Do something with request error
      const errorObj = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(errorObj);
    },
  );

  client.interceptors.response.use(
    (response) => {
      // Any status code that lie within the range of 2xx cause this function to trigger
      // Do something with response data
      return response.data;
    },
    async (error) => {
      // Any status codes that falls outside the range of 2xx cause this function to trigger
      // Do something with response error

      const { response, config } = error;

      if (response?.status === UNAUTHORIZED && !config.retry) {
        // Token expired. Retry authentication here
        if (!isRefreshing) {
          isRefreshing = true;
          const token = await refreshToken();
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
