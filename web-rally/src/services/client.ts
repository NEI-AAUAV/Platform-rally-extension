import axios from "axios";
import { useUserStore } from "@/stores/useUserStore.ts";
import config from "@/config";

const UNAUTHORIZED = 401;

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

/**
 * Attempts to refresh the authentication token using the refresh endpoint
 * 
 * Uses the current token from user store to request a new access token.
 * Automatically updates the user store on success or logs out on failure.
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
  return axios
    .create({
      baseURL: config.API_NEI_URL,
      timeout: 5000,
      headers: {
        Authorization: `Bearer ${useUserStore.getState().token}`,
      },
    })
    .post("/auth/refresh/")
    .then(({ data: { access_token } }) => {
      useUserStore.getState().login({ token: access_token });
      return access_token;
    })
    .catch(() => {
      // Token refresh failed - user needs to login again
      useUserStore.getState().logout();
      return undefined;
    });
}

/**
 * Creates an axios client with authentication and error handling
 * 
 * Features:
 * - Automatic token injection in request headers
 * - Automatic token refresh on 401 errors
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
      // Inject the access token in request header
      config.headers.Authorization = `Bearer ${useUserStore.getState().token}`;
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
