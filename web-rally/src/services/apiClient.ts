import { client } from "@/client/client.gen";
import { useUserStore } from "@/stores/useUserStore";
import { getTeamToken } from "@/lib/auth/tokenStore";

/** Thrown by the generated client on non-2xx responses; carries the HTTP status so callers can branch on it (e.g. 401 handling). */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === "string" ? body : JSON.stringify(body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

client.setConfig({
  baseUrl: "",
});

client.interceptors.request.use(async (request) => {
  const staffToken = useUserStore.getState().token;
  const token = staffToken ?? getTeamToken();
  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }
  return request;
});

client.interceptors.error.use((error, response) => {
  return new ApiError(response?.status ?? 0, error);
});
